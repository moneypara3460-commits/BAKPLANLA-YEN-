import { BACKUP_TABLE, classifyError } from './backup.js';

const normalizeError = (error) => {
  if (!error) return null;
  return {
    kind: classifyError(error),
    code: typeof error.code === 'string' ? error.code : undefined,
  };
};

const normalizeResult = async (query) => {
  const result = await query;
  return { data: result?.data ?? null, error: normalizeError(result?.error) };
};

/** Supabase/PostgREST implementation of the user-scoped backup persistence port. */
export const createSupabaseBackupStore = (supabase) => ({
  canWriteContentBackup: () => normalizeResult(
    supabase.rpc('bakplanla_cloud_backup_writes_allowed')
  ),
  fetchBackup: (uid) => normalizeResult(
    supabase.from(BACKUP_TABLE).select('*').eq('user_id', uid).maybeSingle()
  ),
  fetchBackupMeta: (uid) => normalizeResult(
    supabase.from(BACKUP_TABLE)
      .select('updated_at, task_count, document_count, schema_version')
      .eq('user_id', uid)
      .maybeSingle()
  ),
  insertBackup: (uid, body) => normalizeResult(
    supabase.from(BACKUP_TABLE).insert({ ...body, user_id: uid }).select('updated_at').single()
  ),
  updateBackupIfUnchanged: (uid, expectedUpdatedAt, body) => normalizeResult(
    supabase.from(BACKUP_TABLE)
      .update(body)
      .eq('user_id', uid)
      .eq('updated_at', expectedUpdatedAt)
      .select('updated_at')
  ),
  verifyBackup: (uid) => normalizeResult(
    supabase.from(BACKUP_TABLE).select('payload, checksum').eq('user_id', uid).maybeSingle()
  ),
  deleteBackup: (uid, expectedUpdatedAt) => {
    let query = supabase.from(BACKUP_TABLE).delete().eq('user_id', uid);
    if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
    return normalizeResult(query.select('user_id'));
  },
  fetchBackupOwner: (uid) => normalizeResult(
    supabase.from(BACKUP_TABLE).select('user_id').eq('user_id', uid).maybeSingle()
  ),
});
