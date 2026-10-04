import fs from 'node:fs/promises';
import path from 'node:path';
const map = JSON.parse(await fs.readFile('src/data/assetMap.json', 'utf8'));
await fs.rm('public', { recursive: true, force: true });
for (const [target, source] of Object.entries(map)) {
  const output = path.join('public', target);
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.copyFile(source, output);
}
await fs.mkdir('public/assets', { recursive: true });
for (const name of ['legacy', 'restoration']) await fs.copyFile(`src/assets/styles/${name}.css`, `public/assets/${name}.css`);
await fs.cp('src/assets/images/external', 'public/assets/images/external', { recursive: true });
await fs.cp('src/assets/calendars', 'public/assets/calendars', { recursive: true });

await fs.cp('src/assets/images/affiliates', 'public/assets/images/affiliates', { recursive: true });
