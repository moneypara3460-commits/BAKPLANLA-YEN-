const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'supabase/migrations/20261029190000_initial_catalog_baseline.sql');
const correctionPath = path.join(root, 'supabase/migrations/20261030150000_least_privilege_grants.sql');
const baseline = fs.readFileSync(baselinePath, 'utf8');
const correction = fs.readFileSync(correctionPath, 'utf8');

function grantsByRole(sql) {
  const grants = new Set();
  for (const line of sql.split(/\r?\n/)) {
    const match = line.match(/^GRANT\s+(.+?)\s+ON\s+(TABLE|FUNCTION|SEQUENCE)\s+(.+?)\s+TO\s+"(anon|authenticated|service_role)";?$/i);
    if (!match) continue;
    const [, privileges, kind, object, role] = match;
    for (const privilege of privileges.split(',').map((value) => value.trim().toUpperCase())) {
      grants.add(`${role.toLowerCase()}|${kind.toUpperCase()}|${object}|${privilege}`);
    }
  }
  return grants;
}

function businessRequestPrivilege(entry) {
  return entry.includes('TABLE|"public"."bakplanla_business_requests"');
}

test('DEV grant migration removes role defaults and preserves source grants except unused request DML', () => {
  for (const statement of [
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;',
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;',
  ]) assert.ok(correction.includes(statement), `missing privilege reset: ${statement}`);

  assert.equal((correction.match(/^REVOKE ALL PRIVILEGES ON TABLE /gm) || []).length, 31);
  assert.equal((correction.match(/^REVOKE ALL PRIVILEGES ON SEQUENCE /gm) || []).length, 4);
  assert.equal((correction.match(/^REVOKE EXECUTE ON FUNCTION /gm) || []).length, 78);
  assert.doesNotMatch(correction, /REVOKE .*ON ALL (?:TABLES|SEQUENCES|FUNCTIONS) IN SCHEMA/);

  const sourceGrants = grantsByRole(baseline);
  const candidateGrants = grantsByRole(correction);
  const expected = new Set([...sourceGrants].filter((entry) => {
    if (!businessRequestPrivilege(entry)) return true;
    return entry.startsWith('service_role|') || entry === 'authenticated|TABLE|"public"."bakplanla_business_requests"|SELECT';
  }));

  assert.deepEqual([...candidateGrants].sort(), [...expected].sort());
  assert.ok(candidateGrants.has('authenticated|FUNCTION|"public"."business_request_submit"(p_business_name text, p_category text, p_contact_name text, p_phone text, p_email text, p_district text, p_address text, p_website text, p_instagram text, p_description text, p_offer text)|EXECUTE'));
  assert.ok(candidateGrants.has('authenticated|TABLE|"public"."bakplanla_business_requests"|SELECT'));
  assert.ok(![...candidateGrants].some((entry) => entry.startsWith('anon|TABLE|"public"."bakplanla_business_requests"|')));
  assert.ok(![...candidateGrants].some((entry) => entry.startsWith('authenticated|TABLE|"public"."bakplanla_business_requests"|') && !entry.endsWith('|SELECT')));
});
