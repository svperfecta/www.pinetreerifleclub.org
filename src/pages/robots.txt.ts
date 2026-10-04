export const prerender = import.meta.env.OFFLINE_EXPORT === '1';
export function GET({ url }) {
  const origin = import.meta.env.SITE_URL || url.origin + '/';
  return new Response(`User-agent: *\nAllow: /\nDisallow: /_emdash/\nSitemap: ${new URL('sitemap.xml', origin).href}\n`, { headers: { 'Content-Type': 'text/plain' } });
}
