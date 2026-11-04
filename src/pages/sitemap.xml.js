import { SITE, pages, systems, builtAt, hubIndexed } from '../lib/site.js';

/** One hand-written sitemap: only published pages, each with the date its data really changed. */
export function GET() {
  const dates = [...pages.map((p) => p.lastmod), ...Object.values(systems).map((s) => s.lastmod)].sort();
  const newest = dates.at(-1) || builtAt;
  const urls = [
    { loc: `${SITE}/`, lastmod: newest },
    ...Object.values(systems).filter((s) => hubIndexed(s.key)).map((s) => ({ loc: `${SITE}${s.url}`, lastmod: s.lastmod })),
    ...pages.map((p) => ({ loc: `${SITE}${p.url}`, lastmod: p.lastmod })),
    { loc: `${SITE}/about`, lastmod: '2026-11-05' },
    { loc: `${SITE}/privacy`, lastmod: '2026-11-05' },
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
