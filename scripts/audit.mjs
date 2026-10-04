import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('_site');
const docs = path.resolve('docs');
await mkdir(docs, { recursive: true });
const types = { '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', types[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.AUDIT_URL || `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.html?$/.test(entry.name)) files.push(path.relative(root, file).split(path.sep).join('/'));
  }
}
await collect(root);
const results = [];
let index = 0;
async function worker() {
  const page = await context.newPage();
  while (index < files.length) {
    const file = files[index++];
    const failedRequests = [];
    const remoteAssets = [];
    const onRequest = request => { if (new URL(request.url()).origin !== new URL(base).origin) remoteAssets.push(request.url()); };
    const onResponse = response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); };
    page.on('request', onRequest);
    page.on('response', onResponse);
    await page.goto(new URL(file.split('/').map(encodeURIComponent).join('/'), base).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => { for (const img of document.images) img.loading = 'eager'; });
    await page.evaluate(async () => { await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); });
    await page.waitForLoadState('networkidle');
    const seo = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      h1Count: document.querySelectorAll('h1').length,
      noindex: document.querySelector('meta[name="robots"]')?.content.includes('noindex') || false,
      brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.getAttribute('src')),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    }));
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const violations = audit.violations.map(({ id, impact, description, helpUrl, nodes }) => ({ id, impact, description, helpUrl, count: nodes.length, examples: nodes.slice(0, 5).map(node => ({ html: node.html, target: node.target, summary: node.failureSummary })) }));
    results.push({ file, seo, failedRequests, remoteAssets, violations });
    if (file === 'index.html') {
      await page.screenshot({ path: path.join(docs, 'homepage.png'), fullPage: false });
      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth }));
      results.at(-1).mobile = mobile;
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    page.off('request', onRequest);
    page.off('response', onResponse);
    console.log(`${file}: ${violations.length} accessibility rules flagged`);
  }
  await page.close();
}
try { await Promise.all([worker(), worker(), worker()]); }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
results.sort((a, b) => a.file.localeCompare(b.file));
const report = { generatedAt: new Date().toISOString(), base, pageCount: results.length, results };
await writeFile(path.join(docs, 'audit.json'), JSON.stringify(report, null, 2) + '\n');
const counts = {};
for (const result of results) for (const violation of result.violations) counts[violation.id] = (counts[violation.id] || 0) + 1;
console.log(JSON.stringify({ pages: results.length, rules: counts, brokenImages: results.filter(result => result.seo.brokenImages.length).length, failedResources: results.filter(result => result.failedRequests.length).length, remoteAssets: results.filter(result => result.remoteAssets.length).length }, null, 2));
if (results.some(result => result.violations.length || result.seo.brokenImages.length || result.failedRequests.length || result.remoteAssets.length)) process.exitCode = 1;
