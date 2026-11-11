#!/usr/bin/env node
/**
 * Picks the pages Headway publishes and copies only their data out of the Stopwatch repo.
 *
 * Input: Stopwatch's built data (TRANSIT_DIR, default ~/transit-timetables) and its Search Console
 * ranking, reports/seo/2026-11-recovery/pages_peak_winners.csv.
 * Output: src/data/site.json (everything the page templates read), public/data/<cc>/<sys>/<route>.json
 * (every stop's times, fetched only when a rider changes stop), data/lastmod.json (real lastmod).
 *
 * PAGES sets the total, network pages included (600 since 11 Nov 2026). Ramp it only once most pages are indexed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SRC = process.env.TRANSIT_DIR || path.join(os.homedir(), 'transit-timetables');
const ROOT = path.resolve(import.meta.dirname, '..');
const LIMIT = Number(process.env.PAGES || 600);
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);

// Search demand leans to routes, but a site of nothing else misses "a to b" searches.
const CAPS = { route: Math.round(LIMIT * 0.62), journey: Math.round(LIMIT * 0.22), stop: Math.round(LIMIT * 0.1) };
const IN_SCOPE = /^(au\/|us\/phoenix$)/;

// Keep sparse pages out, but retain useful lower-frequency routes and trips with proven search demand.
const MIN_ROUTE_TRIPS = 6; // busiest day, both directions together
const MIN_STOP_TRIPS = 12; // busiest day, all routes together
const THIN_WEEKLY = 5;
const MIN_KM = 5;
const MAX_VARIANT_TRIPS = 4;

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const clean = (s) => String(s ?? '').replace(/\s*[–—]\s*/g, ' - ').replace(/\s+/g, ' ').trim();
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

const busiest = (r) => Math.max(0, ...Object.values(r.summary || {}).map((s) => s.trips || 0));
function minorVariants(routes) {
  const byShort = new Map(routes.filter((r) => r.short).map((r) => [r.short.toUpperCase(), r]));
  const out = new Set();
  for (const r of routes) {
    const m = /^(.*\d)[A-Za-z]{1,2}$/.exec(r.short || '');
    const main = m && byShort.get(m[1].toUpperCase());
    if (main && busiest(r) <= MAX_VARIANT_TRIPS && busiest(main) >= 3 * busiest(r)) out.add(r.slug);
  }
  return out;
}

/* ---------- source data, loaded once per network ---------- */
const cache = new Map();
function network(key) {
  if (cache.has(key)) return cache.get(key);
  const file = (dir) => path.join(SRC, 'src/data', dir, `${key}.json`);
  if (!fs.existsSync(file('systems'))) { cache.set(key, null); return null; }
  const system = read(file('systems'));
  const stopsList = fs.existsSync(file('stops')) ? read(file('stops')) : [];
  const journeys = fs.existsSync(file('journeys')) ? read(file('journeys')) : null;
  const n = {
    system,
    routes: new Map(system.routes.map((r) => [r.slug, r])),
    minor: minorVariants(system.routes),
    stops: new Map(stopsList.map((s) => [String(s.code), s])),
    journeys,
    placeIndex: journeys ? new Map(journeys.places.map((p, i) => [p.slug, i])) : new Map(),
  };
  cache.set(key, n);
  return n;
}

/* ---------- the ranking ---------- */
const lines = fs.readFileSync(path.join(SRC, 'reports/seo/2026-11-recovery/pages_peak_winners.csv'), 'utf8').trim().split('\n');
const head = lines[0].split(',');
const ranked = lines.slice(1)
  .map((l) => Object.fromEntries(l.split(',').map((v, i) => [head[i], v])))
  .map((r) => {
    const parts = new URL(r.url).pathname.split('/').filter(Boolean);
    return { ...r, parts, key: parts.slice(0, 2).join('/'), clicks: Number(r.peak_clicks) || 0, impr: Number(r.peak_impr) || 0 };
  })
  .filter((r) => IN_SCOPE.test(r.key) && ['route', 'journey', 'stop'].includes(r.type))
  .sort((a, b) => b.clicks - a.clicks || b.impr - a.impr);

function eligible(r) {
  const n = network(r.key);
  if (!n) return null;
  if (r.type === 'route') {
    const route = n.routes.get(r.parts[2]);
    if (!route || n.minor.has(route.slug) || busiest(route) < MIN_ROUTE_TRIPS) return null;
    return { type: 'route', slug: route.slug };
  }
  if (r.type === 'stop') {
    const code = decodeURIComponent(r.parts[3] || '');
    const stop = n.stops.get(code);
    if (!stop) return null;
    const dayTotal = {};
    for (const x of stop.routes) for (const [k, t] of Object.entries(x.times)) dayTotal[k] = (dayTotal[k] || 0) + t.length;
    if (Math.max(0, ...Object.values(dayTotal)) < MIN_STOP_TRIPS) return null;
    return { type: 'stop', code };
  }
  const [from, to] = [r.parts[3], r.parts[5]];
  if (r.parts[2] !== 'from' || r.parts[4] !== 'to' || !n.journeys) return null;
  const a = n.placeIndex.get(from), b = n.placeIndex.get(to);
  const pair = n.journeys.pairs.find((p) => p.a === a && p.b === b);
  if (!pair || !(pair.weekly >= THIN_WEEKLY && pair.km >= MIN_KM)) return null;
  return { type: 'journey', from, to, pair };
}

const picked = [];
const seen = new Set();
const counts = { route: 0, journey: 0, stop: 0 };
const networks = new Set();
for (const r of ranked) {
  if (seen.has(r.url)) continue;
  seen.add(r.url);
  if (counts[r.type] >= CAPS[r.type]) continue;
  const e = eligible(r);
  if (!e) continue;
  const addsNetwork = !networks.has(r.key);
  if (picked.length + networks.size + (addsNetwork ? 1 : 0) + 1 > LIMIT) continue;
  networks.add(r.key);
  picked.push({ ...e, key: r.key, peak: { clicks: r.clicks, impr: r.impr, pos: Number(r.peak_pos) || null } });
  counts[r.type]++;
}

/* ---------- second pass: busy routes with no search history yet ----------
 * Search Console only knows pages Stopwatch already ranked, which runs out at about 136 routes.
 * The rest of the route allowance goes to the routes riders use most: trains and trams first
 * (few lines, heavy searching), then buses by trips on their busiest day. Same quality bar. */
const ALL_KEYS = ['au', 'us'].flatMap((cc) => {
  const dir = path.join(SRC, 'src/data/systems', cc);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => `${cc}/${f.slice(0, -5)}`) : [];
}).filter((k) => IN_SCOPE.test(k));
/** "Ferny Grove - Beenleigh" and "Beenleigh - Ferny Grove" share a key; names without two ends have none. */
function endsKey(key, name) {
  const ends = clean(name).replace(/\s+via\s+.*$/i, '').split(/\s+(?:-|to)\s+/i).map((s) => s.toLowerCase());
  return ends.length === 2 && ends[0] !== ends[1] ? `${key}|${[...ends].sort().join('|')}` : null;
}
const isRail = (t) => [0, 1, 2].includes(Number(t)) || (Number(t) >= 100 && Number(t) < 200) || (Number(t) >= 900 && Number(t) < 1000);
const busy = [];
for (const key of ALL_KEYS) {
  const n = network(key);
  if (!n) continue;
  for (const route of n.system.routes) {
    const url = `https://transit.shivrajsinh.in/${key}/${route.slug}`;
    if (seen.has(url) || n.minor.has(route.slug) || busiest(route) < MIN_ROUTE_TRIPS) continue;
    // A route with no search history has to earn its page: a service most of the week, not a part-week shuttle.
    if (new Set((route.days || []).flatMap((d) => d.days)).size < 5) continue;
    busy.push({ key, slug: route.slug, rail: isRail(route.type), trips: busiest(route), ends: endsKey(key, route.name) });
  }
}
busy.sort((a, b) => b.rail - a.rail || b.trips - a.trips);
// Brisbane lists each train pattern twice (BNFG Beenleigh - Ferny Grove, FGBN back again): one page per pair.
const pairTaken = new Set(picked.filter((p) => p.type === 'route').map((p) => endsKey(p.key, network(p.key).routes.get(p.slug)?.name)));
for (const x of busy) {
  if (counts.route >= CAPS.route) break;
  if (x.ends && pairTaken.has(x.ends)) continue;
  if (x.ends) pairTaken.add(x.ends);
  const addsNetwork = !networks.has(x.key);
  if (picked.length + networks.size + (addsNetwork ? 1 : 0) + 1 > LIMIT) break;
  networks.add(x.key);
  picked.push({ type: 'route', slug: x.slug, key: x.key, peak: { clicks: 0, impr: 0, pos: null } });
  counts.route++;
}

/* ---------- shapes ---------- */
function plate(key, slug) {
  const f = path.join(SRC, 'public/geo', key, `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  const line = read(f).dirs?.[0]?.line;
  if (!line || line.length < 2) return null;
  const midLat = (line.reduce((a, p) => a + p[1], 0) / line.length) * Math.PI / 180;
  const pts = line.map(([lon, lat]) => [lon * Math.cos(midLat), -lat]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = 520, pad = 34;
  const scale = (size - pad * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const ox = (size - (maxX - minX) * scale) / 2, oy = (size - (maxY - minY) * scale) / 2;
  const xy = pts.map(([x, y]) => [Math.round(ox + (x - minX) * scale), Math.round(oy + (y - minY) * scale)]);
  const thin = xy.filter((p, i) => !i || p[0] !== xy[i - 1][0] || p[1] !== xy[i - 1][1]);
  return { d: `M${thin.map((p) => p.join(' ')).join('L')}`, start: thin[0], end: thin.at(-1) };
}

/* ---------- pages ---------- */
const liveExceptions = (list) => (list || []).filter((e) => e.date >= TODAY);

function routeDirections(n, r) {
  const fullStops = [];
  let matched = 0, total = 0;
  // A feed can list one direction once per day type (747: Mon-Wed, then Thu-Fri). The stop files
  // already hold every day under one sign, so a rider should see one sheet per direction.
  const merged = new Map();
  for (const d of r.directions) {
    const sign = clean(d.headsign);
    if (!merged.has(sign)) merged.set(sign, { ...d, schedules: { ...d.schedules } });
    else {
      // Same sign, more trips (Traralgon 40 splits one direction into three patterns): lay them onto the first pattern's columns.
      const m = merged.get(sign);
      const to = (d.columns || []).map((c) => (m.columns || []).findIndex((x) => String(x.code) === String(c.code)));
      const lead = (row) => row.find((t) => t != null) ?? 0;
      for (const [k, rows] of Object.entries(d.schedules)) {
        const moved = rows.map((row) => { const out = (m.columns || []).map(() => null); row.forEach((t, i) => { if (to[i] >= 0) out[to[i]] = t; }); return out; });
        m.schedules[k] = [...(m.schedules[k] || []), ...moved].sort((x, y) => lead(x) - lead(y));
      }
    }
  }
  const dirs = [...merged.values()].map((d) => {
    const all = {};
    const stops = [];
    const seenCodes = new Set();
    for (const s of d.stops) {
      total++;
      const code = String(s.code);
      // One route and sign can have an entry per day type (747: Mon-Wed, Thu-Fri): a rider needs them all.
      const entries = n.stops.get(code)?.routes.filter((x) => x.route === r.slug && clean(x.headsign) === clean(d.headsign)) || [];
      const times = entries.length ? Object.assign({}, ...entries.map((x) => x.times)) : null;
      if (times) matched++;
      stops.push({ code, name: clean(s.name), times });
      if (times && !seenCodes.has(code)) { seenCodes.add(code); all[code] = times; }
    }
    // The timetable's columns are by trip; a stop file can file trips under another sign (Geelong 30
    // showed 1 trip against a real 34). Where they disagree at the first stop, trust the columns:
    // riders get the exact timepoints rather than partial times at every stop.
    const colTimes = (ci, key) => (d.schedules[key] || []).map((row) => row[ci]).filter((t) => t != null).sort((x, y) => x - y);
    const dayKeys = Object.keys(d.schedules);
    const firstColCode = String(d.columns?.[0]?.code);
    const firstEntry = stops.find((s) => s.code === firstColCode);
    const agrees = dayKeys.every((k) => {
      const want = colTimes(0, k), got = firstEntry?.times?.[k] || [];
      return want.length === got.length && want.every((t, i) => t === got[i]);
    });
    if (!agrees) {
      report.columnsOnly.push(`${r.slug}: ${d.headsign}`);
      let at = 0;
      for (const st of stops) st.times = null;
      (d.columns || []).forEach((c, ci) => {
        for (let i = at; i < stops.length; i++) {
          if (stops[i].code === String(c.code)) { stops[i].times = Object.fromEntries(dayKeys.map((k) => [k, colTimes(ci, k)]).filter(([, t]) => t.length)); at = i + 1; break; }
        }
      });
      for (const code of Object.keys(all)) delete all[code];
      for (const st of stops) if (st.times && !all[st.code]) all[st.code] = st.times;
    }
    const firstStop = stops.find((s) => s.times);
    let first = firstStop?.times;
    let firstCode = firstStop?.code;
    if (!first) {
      // The stops file has no match: fall back to the first timetable column.
      first = Object.fromEntries(Object.entries(d.schedules).map(([k, rows]) => [k, rows.map((row) => row[0]).filter((t) => t != null)]));
      firstCode = String(d.columns?.[0]?.code ?? d.stops[0]?.code);
      all[firstCode] = first;
    }
    // Minutes from the start. Stop files list a stop's times with no trip ids, so times can't be
    // paired by position: Phoenix 61's end-to-end came out 46 min against a real 2h 11m. The
    // timetable's own columns are by trip, so they anchor the figure: a stop's time counts for a trip
    // only when it falls between that trip's neighbouring timepoints.
    const rowsKey = Object.keys(d.schedules).sort((a, b) => d.schedules[b].length - d.schedules[a].length)[0];
    const rows = d.schedules[rowsKey] || [];
    const colAt = new Map();
    let cursor = 0;
    (d.columns || []).forEach((c, ci) => {
      for (let i = cursor; i < d.stops.length; i++) {
        if (String(d.stops[i].code) === String(c.code)) { colAt.set(i, ci); cursor = i + 1; break; }
      }
    });
    const anchors = [...colAt.keys()].sort((a, b) => a - b);
    let floor = 0;
    const lean = stops.map((s, i) => {
      const diffs = [];
      if (colAt.has(i)) {
        const c = colAt.get(i);
        for (const row of rows) if (row[0] != null && row[c] != null) diffs.push(row[c] - row[0]);
      } else {
        const before = [...anchors].reverse().find((a) => a < i), after = anchors.find((a) => a > i);
        const times = s.times?.[rowsKey];
        if (times && before != null && after != null) {
          const [lo, hi] = [colAt.get(before), colAt.get(after)];
          for (const row of rows) {
            if (row[0] == null || row[lo] == null || row[hi] == null) continue;
            const hit = times.find((t) => t >= row[lo] && t <= row[hi]);
            if (hit != null) diffs.push(hit - row[0]);
          }
        }
      }
      let min = diffs.length ? median(diffs) : null;
      if (min != null && min < floor) min = null; // never let a stop read earlier than the one before it
      if (min != null) floor = min;
      return { code: s.code, name: s.name, min, hasTimes: Boolean(s.times) };
    });
    fullStops.push(all);
    // A day can begin part-way along the route (Adelaide 252's Saturdays): the summaries must not call that "no buses".
    const later = {};
    for (const k of dayKeys) {
      if (first[k]?.length) continue;
      const st = stops.find((x) => x.times?.[k]?.length);
      if (st) { later[k] = { name: st.name, times: st.times[k] }; continue; }
      const ci = (d.columns || []).findIndex((_, i) => colTimes(i, k).length);
      if (ci >= 0) later[k] = { name: clean(d.columns[ci].name), times: colTimes(ci, k) };
    }
    return { headsign: clean(d.headsign), firstCode, firstName: clean(d.stops.find((s) => String(s.code) === firstCode)?.name ?? d.stops[0]?.name), lastName: clean(d.stops.at(-1)?.name), first, later, stops: lean };
  });
  return { dirs, fullStops, matched, total };
}

const pages = [];
const report = { stopMatch: [], dataBytes: 0, columnsOnly: [] };
const dataDir = path.join(ROOT, 'public/data');
fs.rmSync(dataDir, { recursive: true, force: true });

for (const p of picked) {
  const n = network(p.key);
  const [cc, sys] = p.key.split('/');
  const base = `/${cc}/${sys}`;
  if (p.type === 'route') {
    const r = n.routes.get(p.slug);
    const { dirs, fullStops, matched, total } = routeDirections(n, r);
    report.stopMatch.push([`${p.key}/${r.slug}`, matched, total]);
    const dataUrl = `/data/${cc}/${sys}/${r.slug}.json`;
    const outFile = path.join(ROOT, 'public', dataUrl);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const blob = JSON.stringify({ dirs: fullStops });
    fs.writeFileSync(outFile, blob);
    report.dataBytes += blob.length;
    pages.push({
      type: 'route', key: p.key, url: `${base}/${r.slug}`, slug: r.slug, short: /^[A-Z]{3,}$/.test(clean(r.short)) ? '' : clean(r.short), // feed codes (SEAFRD, FGBN) are not route numbers riders know
      name: clean(r.name), routeType: r.type,
      label: r.label ? clean(r.label) : '', color: r.color || null, textColor: r.textColor || null, days: r.days, exceptions: liveExceptions(r.exceptions),
      dirs, dataUrl, shape: plate(p.key, r.slug), peak: p.peak,
    });
  } else if (p.type === 'stop') {
    const s = n.stops.get(p.code);
    pages.push({
      type: 'stop', key: p.key, url: `${base}/stop/${encodeURIComponent(p.code)}`, code: p.code, name: clean(s.name), lat: s.lat, lon: s.lon,
      routes: [...s.routes.reduce((map, x) => {
        // Same merge as route pages: one row per route and direction, whatever the feed's day splits.
        const id = `${x.route}|${clean(x.headsign)}`;
        if (!map.has(id)) map.set(id, { ...x, times: { ...x.times } });
        else Object.assign(map.get(id).times, x.times);
        return map;
      }, new Map()).values()].map((x) => {
        const full = n.routes.get(x.route);
        return { slug: x.route, short: clean(x.short), name: clean(x.name), color: x.color || null, textColor: full?.textColor || null, routeType: full?.type ?? 3, headsign: clean(x.headsign), days: full?.days || x.days, times: x.times, exceptions: liveExceptions(full?.exceptions) };
      }),
      peak: p.peak,
    });
  } else {
    const j = n.journeys, pair = p.pair;
    const routes = pair.routes.map((slug) => n.routes.get(slug)).filter(Boolean);
    const stopNames = {};
    const stopLookup = Array.isArray(j.stops) ? Object.fromEntries(j.stops) : j.stops;
    for (const rows of Object.values(pair.trips)) for (const t of rows) { for (const c of [t[3], t[4]]) stopNames[c] = clean(stopLookup[c] ?? c); }
    const dates = [...new Set(routes.flatMap((r) => liveExceptions(r.exceptions).map((e) => e.date)))].sort();
    const exceptions = [];
    for (const date of dates) {
      const wd = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
      let holiday = null;
      const outcomes = routes.map((r) => {
        const e = r.exceptions.find((y) => y.date === date);
        if (!e) return wd;
        holiday ||= e.holiday;
        if (e.runs === 'none' || e.runs === 'special') return e.runs;
        return r.days.find((d) => d.key === e.runs)?.days[0] ?? 'special';
      });
      const first = outcomes[0];
      const runs = !outcomes.every((o) => o === first) ? 'special' : (first === 'none' || first === 'special') ? first : pair.days.find((d) => d.days.includes(first))?.key || 'none';
      const usual = pair.days.find((d) => d.days.includes(wd))?.key || 'none';
      if (runs !== usual) exceptions.push({ date, holiday, runs });
    }
    pages.push({
      type: 'journey', key: p.key, url: `${base}/from/${p.from}/to/${p.to}`, from: p.from, to: p.to,
      fromName: clean(j.places[pair.a].name), toName: clean(j.places[pair.b].name), km: pair.km, weekly: pair.weekly,
      routes: routes.map((r) => ({ slug: r.slug, short: clean(r.short), name: clean(r.name), color: r.color || null, textColor: r.textColor || null, routeType: r.type })),
      days: pair.days, trips: pair.trips, stopNames, exceptions, shape: routes[0] ? plate(p.key, routes[0].slug) : null, peak: p.peak,
    });
  }
}

/* ---------- links: only between pages that exist ---------- */
const published = new Set(pages.map((p) => p.url));
for (const p of pages.filter((x) => x.type === 'route')) {
  const codes = new Set(p.dirs.flatMap((d) => d.stops.map((s) => s.code)));
  const scored = pages
    .filter((o) => o.type === 'route' && o.key === p.key && o !== p)
    .map((o) => ({ o, shared: o.dirs.flatMap((d) => d.stops).filter((s) => codes.has(s.code)).length }))
    .sort((a, b) => b.shared - a.shared || b.o.peak.clicks - a.o.peak.clicks || b.o.peak.impr - a.o.peak.impr);
  const near = scored.filter((x) => x.shared > 0).slice(0, 8);
  p.relatedShare = near.length > 0;
  p.related = (near.length ? near : scored.slice(0, 6)).map((x) => x.o.url);
  p.journeys = pages.filter((o) => o.type === 'journey' && o.key === p.key && o.routes.some((r) => r.slug === p.slug)).map((o) => o.url).slice(0, 8);
  p.stopLinks = p.dirs.flatMap((d) => d.stops.map((s) => s.code)).filter((c, i, a) => a.indexOf(c) === i && published.has(`/${p.key}/stop/${encodeURIComponent(c)}`));
}
for (const p of pages.filter((x) => x.type === 'journey')) {
  const rev = `/${p.key}/from/${p.to}/to/${p.from}`;
  p.reverse = published.has(rev) ? rev : null;
}

/* ---------- networks ---------- */
const systems = {};
for (const key of networks) {
  const { system: s } = network(key);
  systems[key] = {
    key, cc: s.cc, slug: s.slug, name: clean(s.name), area: clean(s.area), tram: s.tram || null, timezone: s.timezone, builtOn: s.builtOn,
    feed: s.feed, attribution: { ...s.attribution, text: clean(s.attribution?.text), license: clean(s.attribution?.license) }, changesOn: s.changesOn && s.changesOn >= TODAY ? s.changesOn : null, totalRoutes: s.routes.length, url: `/${key}`,
  };
}
pages.forEach((p) => { p.systemBuiltOn = systems[p.key].builtOn; });

/* ---------- real lastmod: a date moves only when the page's data does ---------- */
const lmFile = path.join(ROOT, 'data/lastmod.json');
const lastmod = fs.existsSync(lmFile) ? read(lmFile) : {};
const stamp = (url, value) => {
  const hash = crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);
  if (lastmod[url]?.hash !== hash) lastmod[url] = { hash, date: TODAY };
  return lastmod[url].date;
};
for (const p of pages) {
  const { peak, systemBuiltOn, ...content } = p;
  p.lastmod = stamp(p.url, content);
  delete p.systemBuiltOn;
}
for (const s of Object.values(systems)) {
  const members = pages.filter((p) => p.key === s.key).map((p) => p.url);
  s.lastmod = stamp(s.url, { members, feed: s.feed, builtOn: s.builtOn });
}
fs.mkdirSync(path.dirname(lmFile), { recursive: true });
fs.writeFileSync(lmFile, `${JSON.stringify(lastmod, null, 1)}\n`);

/* ---------- write ---------- */
const site = { builtAt: TODAY, systems, pages };
const out = path.join(ROOT, 'src/data/site.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(site));

/* Operators' route colours, as tokens: badges refer to them rather than carrying literal colours. */
const colours = new Set();
const addColour = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); if (m) colours.add(m[1].toLowerCase()); };
for (const p of pages) {
  if (p.type === 'route') addColour(p.color);
  else p.routes.forEach((r) => addColour(r.color));
}
fs.writeFileSync(path.join(ROOT, 'src/styles/routes.css'), `/* Written by scripts/sync-data.mjs: operators' own route colours. */\n:root {\n${[...colours].sort().map((c) => `  --r-${c}: #${c};`).join('\n')}\n}\n`);

/* ---------- report ---------- */
const poorMatch = report.stopMatch.filter(([, m, t]) => m / t < 0.9);
console.log(`pages: ${pages.length} + ${networks.size} networks = ${pages.length + networks.size} (limit ${LIMIT})`);
console.log('by type', counts);
console.log('by network', Object.fromEntries([...networks].map((k) => [k, pages.filter((p) => p.key === k).length])));
console.log(`site.json ${(fs.statSync(out).size / 1048576).toFixed(1)} MB, stop data ${(report.dataBytes / 1048576).toFixed(1)} MB`);
console.log(`routes with under 90% of stops matched to times: ${poorMatch.length}`, poorMatch.slice(0, 12));
console.log(`directions using timepoints only (stop files disagree with the timetable): ${report.columnsOnly.length}`, report.columnsOnly);
