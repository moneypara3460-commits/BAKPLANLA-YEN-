// Offline checks only: never import/execute application code or contact its backend.
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');
const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root).filter(name => name.endsWith('.js'));
let failures = 0;
function fail(message) { console.error(message); failures++; }
for (const name of files) {
  try {
    const ast = parse(fs.readFileSync(path.join(root, name), 'utf8'), {
      sourceType: 'unambiguous', plugins: ['jsx'],
    });
    for (const item of ast.program.body) {
      if (!item.source || !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(item.type)) continue;
      const target = item.source.value;
      if (target.startsWith('.')) {
        if (!['', '.js', '.json', '/index.js'].some(ext => fs.existsSync(path.resolve(root, target + ext)))) {
          fail(`${name}: missing local import ${target}`);
        }
      } else {
        try { require.resolve(target, { paths: [root] }); }
        catch { fail(`${name}: unresolved package import ${target}`); }
      }
    }
  } catch (error) { fail(`${name}: ${error.message}`); }
}
const expo = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const assets = [expo.icon, expo.splash?.image, expo.android?.adaptiveIcon?.foregroundImage, expo.web?.favicon].filter(Boolean);
for (const asset of assets) {
  if (!fs.existsSync(path.resolve(root, asset))) fail(`Missing Expo asset: ${asset}`);
}
console.log(`Checked ${files.length} JavaScript/JSX files and ${assets.length} configured assets; ${failures} failure(s).`);
process.exitCode = failures ? 1 : 0;
