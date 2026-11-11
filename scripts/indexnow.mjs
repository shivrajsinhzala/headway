#!/usr/bin/env node
/** Submit every currently published Headway URL to participating search engines. */
import fs from 'node:fs';

const HOST = 'headway.shivrajsinh.in';
const key = fs.readFileSync(new URL('../data/indexnow-key.txt', import.meta.url), 'utf8').trim();
const keyUrl = `https://${HOST}/${key}.txt`;
const [sitemap, verification] = await Promise.all([
  fetch(`https://${HOST}/sitemap.xml`).then(async (r) => { if (!r.ok) throw new Error(`sitemap HTTP ${r.status}`); return r.text(); }),
  fetch(keyUrl).then(async (r) => { if (!r.ok || (await r.text()).trim() !== key) throw new Error(`key verification HTTP ${r.status}`); }),
]);
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!urls.length || urls.some((u) => new URL(u).host !== HOST)) throw new Error('Invalid or empty sitemap');

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key, keyLocation: keyUrl, urlList: urls }),
});
console.log(`IndexNow: ${urls.length} URLs -> HTTP ${res.status}`);
if (!res.ok) throw new Error((await res.text()).slice(0, 300));
