import recovered from '../content/recovered.json';
import { getEmDashCollection } from 'emdash';
export const prerender = import.meta.env.OFFLINE_EXPORT === '1';
export async function GET({ url }) {
  const origin = import.meta.env.SITE_URL || url.origin + '/';
  let pages = recovered.map(entry => entry.data);
  if (import.meta.env.OFFLINE_EXPORT !== '1') {
    pages = [];
    let cursor;
    do {
      const result = await getEmDashCollection('pages', { limit: 100, ...(cursor ? { cursor } : {}) });
      if (result.error) throw result.error;
      pages.push(...result.entries.map(entry => entry.data));
      cursor = result.nextCursor;
    } while (cursor);
  }
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const links = pages.filter(page => !page.historical).map(page => `<url><loc>${escape(new URL(page.path, origin).href)}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${links}</urlset>`, { headers: { 'Content-Type': 'application/xml' } });
}
