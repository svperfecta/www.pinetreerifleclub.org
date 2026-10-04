/** One-time conversion of recovered templates to EmDash seed content. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import nunjucks from 'nunjucks';
import yaml from 'js-yaml';
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader('recovery/templates/_includes'), { autoescape: false });
env.addFilter('relativeTo', (target, url) => encodeURI(path.posix.relative(path.posix.dirname(url.replace(/^\//, '')), target) || 'index.html'));
env.addFilter('absoluteUrl', target => target.replace(/^\//, ''));
const recovered = JSON.parse(await fs.readFile('src/data/recovered.json', 'utf8'));
const entries = [];
async function visit(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (file.endsWith('.njk')) {
      const source = await fs.readFile(file, 'utf8');
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
      if (!match) continue;
      const meta = yaml.load(match[1]);
      if (!/\.html?$/.test(meta.permalink)) continue;
      const url = '/' + meta.permalink;
      const body = env.renderString(match[2], { recovered, page: { url }, site: { name: 'Pine Tree Rifle Club' } });
      const slug = meta.permalink === 'index.html' ? 'home' : 'page-' + createHash('sha256').update(meta.permalink).digest('hex').slice(0, 16);
      entries.push({ id: slug, slug, status: 'published', data: {
        title: meta.title, description: meta.isHome ? 'Pine Tree Rifle Club in Johnstown, New York. Club information, membership, shooting activities, training programs, and events.' : meta.description || `${meta.title}. Club information from Pine Tree Rifle Club in Johnstown, New York.`,
        path: meta.permalink, body, head: meta.legacyHead || '', body_class: meta.legacyBodyClass || '',
        home: !!meta.isHome, has_heading: !!meta.hasHeading, historical: !!meta.historical,
      } });
    }
  }
}
await visit('recovery/templates/pages');
for (const file of ['site-directory', 'missing-content', '404']) {
  const temp = `recovery/templates/pages/_migration-${file}.njk`;
  await fs.copyFile(`recovery/templates/${file}.njk`, temp);
  // Visit only this file through a temporary directory to avoid duplicates.
  const directory = '.tmp-migration'; await fs.mkdir(directory, { recursive: true });
  await fs.rename(temp, `${directory}/${file}.njk`); await visit(directory);
  await fs.unlink(`${directory}/${file}.njk`); await fs.rmdir(directory);
}
entries.sort((a, b) => a.data.path.localeCompare(b.data.path));
const fields = [
  ['title', 'Title', 'string'], ['description', 'Description', 'text'], ['path', 'Original URL path', 'string'],
  ['body', 'Recovered HTML content', 'text'], ['head', 'Page styles', 'text'], ['body_class', 'Compatibility classes', 'string'],
  ['home', 'Homepage', 'boolean'], ['has_heading', 'Content includes H1', 'boolean'], ['historical', 'Historical content', 'boolean'],
].map(([slug, label, type]) => ({ slug, label, type, required: slug === 'title' || slug === 'path', ...(slug === 'path' ? { indexed: true, unique: true } : {}) }));
const seed = { version: '1', meta: { name: 'Pine Tree Rifle Club restoration' }, settings: { title: 'Pine Tree Rifle Club', timezone: 'America/New_York' },
  collections: [{ slug: 'pages', label: 'Pages', labelSingular: 'Page', titleField: 'title', routable: true, supports: ['drafts', 'revisions', 'scheduling', 'search', 'seo'], fields }],
  content: { pages: entries } };
await fs.mkdir('seed', { recursive: true }); await fs.mkdir('src/content', { recursive: true }); await fs.mkdir('src/components', { recursive: true });
await fs.writeFile('seed/seed.json', JSON.stringify(seed, null, 2) + '\n');
await fs.writeFile('src/content/recovered.json', JSON.stringify(entries, null, 2) + '\n');
await fs.writeFile('src/components/home-header.html', await fs.readFile('recovery/templates/_includes/home-header.njk', 'utf8'));
console.log(`Converted ${entries.length} pages to EmDash seed content`);
