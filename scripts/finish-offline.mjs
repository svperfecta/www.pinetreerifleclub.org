import fs from 'node:fs/promises';
import path from 'node:path';
const entries = JSON.parse(await fs.readFile('src/content/recovered.json', 'utf8'));
await fs.rm('_site', { recursive: true, force: true });
await fs.mkdir('_site', { recursive: true });
await fs.cp('public', '_site', { recursive: true });
for (const name of ['sitemap.xml', 'robots.txt']) await fs.copyFile(path.join('.offline-build', name), path.join('_site', name));
for (const entry of entries) {
  const destination = path.join('_site', entry.data.path);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(path.join('.offline-build', entry.data.path, 'index.html'), destination);
}
console.log(`Exported ${entries.length} recovered pages with local assets`);
