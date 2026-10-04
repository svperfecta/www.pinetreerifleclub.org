/** Keep static recovery export routes separate from the live CMS routes. */
import fs from 'node:fs/promises';
await fs.rm('.offline-source', { recursive: true, force: true });
await fs.mkdir('.offline-source/pages', { recursive: true });
for (const name of ['layouts', 'components', 'content']) await fs.cp(`src/${name}`, `.offline-source/${name}`, { recursive: true });
for (const name of ['sitemap.xml.ts', 'robots.txt.ts']) await fs.copyFile(`src/pages/${name}`, `.offline-source/pages/${name}`);
await fs.writeFile('.offline-source/pages/[...path].astro', `---
import Base from '../layouts/Base.astro';
import recovered from '../content/recovered.json';
export function getStaticPaths() {
  return recovered.map(entry => ({ params: { path: entry.data.path }, props: { page: entry.data } }));
}
const { page } = Astro.props;
---
<Base page={page} />
`);
