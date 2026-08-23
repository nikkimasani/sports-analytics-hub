import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.cloudflare-pages');
const skip = new Set([
  '.git', '.github', '.cloudflare-pages', 'functions', 'scripts', 'node_modules',
  'wrangler.jsonc', 'vercel.json', 'package.json', 'package-lock.json', 'README.md'
]);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (skip.has(entry.name) || entry.name.startsWith('.env')) continue;
  await cp(path.join(root, entry.name), path.join(out, entry.name), { recursive: true });
}
console.log(`Prepared StatVault Cloudflare assets in ${out}`);
