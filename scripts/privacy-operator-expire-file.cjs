const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const target = path.resolve(process.argv[2] ?? '');
  const deadline = Number(process.argv[3]);
  const root = path.resolve(__dirname, '..', '.local', 'privacy-cases');
  const relative = path.relative(root, target);
  if (!relative.startsWith('opened-') || relative.includes(path.sep) || !Number.isFinite(deadline)) process.exit(2);
  const delay = deadline - Date.now();
  if (delay <= 0 || delay > 15 * 60 * 1000 + 60_000) process.exit(2);
  setTimeout(async () => {
    try {
      const stat = await fs.lstat(target);
      if (stat.isFile() || stat.isSymbolicLink()) await fs.unlink(target);
    } catch {}
  }, delay);
}

main().catch(() => process.exit(2));
