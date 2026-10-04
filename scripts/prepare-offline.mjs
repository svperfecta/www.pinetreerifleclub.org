/** Keep static recovery export routes separate from the live CMS routes. */
import fs from 'node:fs/promises';
await fs.rm('.offline-source', { recursive: true, force: true });
await fs.mkdir('.offline-source/pages', { recursive: true });
for (const name of ['layouts', 'components', 'content', 'data', 'styles']) await fs.cp(`src/${name}`, `.offline-source/${name}`, { recursive: true });
for (const name of ['sitemap.xml.ts', 'robots.txt.ts']) await fs.copyFile(`src/pages/${name}`, `.offline-source/pages/${name}`);
await fs.writeFile('.offline-source/pages/[...path].astro', `---
import Base from '../layouts/Base.astro';
import recovered from '../content/recovered.json';
export function getStaticPaths() {
  return recovered.map(entry => ({ params: { path: entry.data.path === 'index.html' ? 'original-home.html' : entry.data.path }, props: { page: entry.data } }));
}
const { page } = Astro.props;
---
<Base page={page} />
`);

await fs.writeFile('.offline-source/pages/index.astro', `---
import ThemePage from '../components/ThemePage.astro';
---
<ThemePage slug="home"/>\n`);
await fs.mkdir('.offline-source/pages/news',{recursive:true});
await fs.writeFile('.offline-source/pages/[section].astro', `---
import ThemePage from '../components/ThemePage.astro';
import content from '../data/theme-content.json';
export function getStaticPaths(){return [...Object.keys(content.pages),'scores','news','events','search'].map(section=>({params:{section}}));}
---
<ThemePage slug={Astro.params.section}/>
`);
await fs.writeFile('.offline-source/pages/news/[slug].astro', `---
import ThemePage from '../../components/ThemePage.astro';
import content from '../../data/theme-content.json';
export function getStaticPaths(){return content.news.map(n=>({params:{slug:n.slug}}));}
---
<ThemePage slug={\`news/\${Astro.params.slug}\`}/>
`);
