#!/usr/bin/env node
/**
 * Stops a release if any page would embarrass the site: missing title or description, a duplicate
 * title, a link to a page that doesn't exist, a placeholder left in, or an empty timetable.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '../dist');
const SITE = 'https://headway.shivrajsinh.in';
const OFFICIAL_ROUTES = new Map([
  ['/au/adelaide/route-405', 'https://www.adelaidemetro.com.au/routes/405'],
  ['/au/adelaide/route-839', 'https://www.adelaidemetro.com.au/routes/839'],
  ['/au/adelaide/route-400', 'https://www.adelaidemetro.com.au/routes/400'],
  ['/au/brisbane/route-390', 'https://jp.translink.com.au/plan-your-journey/timetables/bus/t/390'],
  ['/au/brisbane/route-326', 'https://jp.translink.com.au/plan-your-journey/timetables/bus/t/326'],
  ['/us/phoenix/route-3', 'https://www.valleymetro.org/maps-schedules/3'],
]);
const DESCRIPTIVE_LINKS = new Map([
  ['/au/adelaide', '/au/adelaide/route-405">Salisbury to Paralowie Clockwise Loop timetable</a>'],
  ['/au/brisbane', '/au/brisbane/route-390">Mitchelton to City timetable</a>'],
  ['/us/phoenix/from/phoenix/to/tolleson', '/us/phoenix/route-3">Van Buren St schedule</a>'],
]);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'data' && e.name !== '_astro') walk(p); } else if (e.name.endsWith('.html')) files.push(p);
  }
})(DIST);

const urlOf = (f) => {
  const rel = path.relative(DIST, f).replace(/\.html$/, '');
  return rel === 'index' ? '/' : `/${rel}`;
};
const existing = new Set(files.map(urlOf));
const problems = [];
const titles = new Map();
const words = [];
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

for (const f of files) {
  const url = urlOf(f);
  const html = fs.readFileSync(f, 'utf8');
  const bad = (msg) => problems.push(`${url}: ${msg}`);
  const noindex = /<meta name="robots" content="noindex"/.test(html);
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  const desc = /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
  if (!title) bad('no title');
  if (!desc) bad('no description');
  for (const field of ['twitter:title', 'twitter:description', 'twitter:image']) if (!html.includes(`<meta name="${field}"`)) bad(`missing ${field}`);
  // FAQPage JSON-LD is allowed again (12 Nov 2026): Google shows no rich result for it, but it mirrors the
  // visible questions for answer engines. It must only ever repeat what the page shows.
  if (desc && desc.length > 170) bad(`description ${desc.length} chars`);
  if (title && title.length > 75) bad(`title ${title.length} chars: ${title}`);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) bad('not exactly one h1');
  if (!noindex && !html.includes(`<link rel="canonical" href="${SITE}${url}"`)) bad('canonical missing or wrong');
  if (title) { if (titles.has(title)) bad(`title also on ${titles.get(title)}`); titles.set(title, url); }

  const text = strip(html);
  if (/\[[A-Z][^\]]{3,}\]/.test(text)) bad('bracket placeholder left in');
  if (/undefined|NaN|\[object/.test(text)) bad('undefined, NaN or [object] in the text');
  if (/[–—]/.test(text)) bad('typographic dash in the text');
  if (/See all \d+ routes|\bAll \d+ [^.]{0,60} routes/.test(text)) bad('claims routes that are not published');

  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const target = decodeURI(href.split(/[?#]/)[0]) || '/';
    if (!existing.has(target) && !existing.has(encodeURI(target))) bad(`broken link ${href}`);
  }
  const isRoute = /<div class="times-layout"/.test(html);
  if (isRoute && !html.includes('class="m"')) bad('route page with no times');
  if (isRoute && !html.includes('<p class="section-note route-facts">')) bad('route page with no service facts');
  const facts = /<p class="section-note route-facts">([^<]*)/.exec(html)?.[1];
  if (facts && /and .* and/.test(facts)) bad(`awkward service-day summary: ${facts}`);
  if (OFFICIAL_ROUTES.has(url) && !html.includes(`href="${OFFICIAL_ROUTES.get(url)}"`)) bad('missing official route link');
  if (DESCRIPTIVE_LINKS.has(url) && !html.includes(`href="${DESCRIPTIVE_LINKS.get(url)}`)) bad('missing descriptive timetable link');
  if (!noindex) words.push([url, text.trim().split(/\s+/).length]);
}

const sitemap = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, '') || '/');
for (const u of listed) if (!existing.has(decodeURI(u)) && !existing.has(u)) problems.push(`sitemap lists missing page ${u}`);
if (/<lastmod>undefined/.test(sitemap)) problems.push('sitemap has an undefined lastmod');

const sorted = words.map((w) => w[1]).sort((a, b) => a - b);
console.log(`${files.length} html files, ${listed.length} in the sitemap`);
console.log(`words per page: min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted.at(-1)}`);
console.log('shortest:', words.sort((a, b) => a[1] - b[1]).slice(0, 6).map(([u, n]) => `${u} ${n}`).join(', '));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 60).join('\n')}`);
  process.exit(1);
}
console.log('verify-build: all clear');
