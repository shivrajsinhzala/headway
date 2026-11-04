/** Everything page templates share: the published set, names and the words each network uses. */
import site from '../data/site.json';
import { fmt, median } from './time.js';

export const SITE = 'https://headway.shivrajsinh.in';
export const { pages, systems, builtAt } = site;
export const byUrl = new Map(pages.map((p) => [p.url, p]));
export const inNetwork = (key, type) => pages.filter((p) => p.key === key && (!type || p.type === type));
export const byDemand = (a, b) => b.peak.clicks - a.peak.clicks || b.peak.impr - a.peak.impr;

/** A hub listing one or two pages is thin, the kind of page Google rejected on Stopwatch: it stays for riders but out of the index until it has more. */
export const MIN_HUB_PAGES = 3;
export const hubIndexed = (key) => inNetwork(key).length >= MIN_HUB_PAGES;

const CITY = {
  'au/brisbane': 'Brisbane', 'us/phoenix': 'Phoenix', 'au/adelaide': 'Adelaide', 'au/melbourne-buses': 'Melbourne', 'au/melbourne-trams': 'Melbourne',
  'au/melbourne-trains': 'Melbourne', 'au/vline-coaches': 'V/Line', 'au/vline-trains': 'V/Line', 'au/victoria-regional-buses': 'Victoria', 'au/canberra-light-rail': 'Canberra',
};
export const cityOf = (sys) => CITY[sys.key] || sys.name;
const COUNTRY = { au: 'Australia', us: 'United States' };
export const countryOf = (cc) => COUNTRY[cc] || cc.toUpperCase();

/** Australians search "timetable", Americans "schedule". */
export const tWord = (sys) => (sys.cc === 'us' ? 'schedule' : 'timetable');

function baseType(type) {
  const t = Number(type);
  if (!(t >= 100)) return t;
  return t < 200 ? 2 : t < 300 ? 3 : t < 500 ? 1 : t < 900 ? 3 : t < 1000 ? 0 : t < 1100 ? 4 : t < 1400 ? 6 : 7;
}

/** What riders call the mode: bus, coach, tram, train, ferry, light rail. */
export function modeFor(type, sys) {
  const t = baseType(type);
  if (t === 0) return sys?.tram || 'tram';
  if (t === 3 && /coach/i.test(sys?.name || '')) return 'coach';
  return ({ 1: 'subway', 2: 'train', 4: 'ferry', 5: 'cable car', 6: 'gondola', 7: 'funicular', 12: 'monorail' })[t] || 'bus';
}
export const vehicleFor = (type, sys) => { const n = modeFor(type, sys); return n === 'subway' || n === 'light rail' || n === 'monorail' ? 'train' : n; };
export const pluralOf = (n) => ({ bus: 'buses', coach: 'coaches', ferry: 'ferries' })[n] || `${n}s`;
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function routeLabel(r) {
  if (r.label) return r.label;
  if (!r.short) return r.name;
  const t = baseType(r.routeType);
  if ([0, 1, 2, 12].includes(t) && !/\d/.test(r.short)) return /line$/i.test(r.short) ? r.short : `${r.short} Line`;
  if ([1, 2].includes(t)) return `Line ${r.short}`;
  return `Route ${r.short}`;
}

/** "Redland Bay Marina, platform 1" -> "Redland Bay Marina": the place, without where in it you board. */
export const place = (name) => String(name)
  .replace(/,?\s+(platform|stand|bay|stop|gate|zone)\s*#?\s*[A-Z0-9]{1,3}$/i, '')
  .replace(/\s+Bay\s*#?\s*(?:[A-Z]|\d{1,2})$/, '')
  .replace(/\s*#\s*[A-Z]?\d+[A-Z]?$/i, '')
  .trim();

/** Phoenix's signs join streets with a plus ("Buckeye Rd+59th Ave"). */
export const signText = (s) => String(s).replace(/\s*\+\s*/g, ' & ');

/** Where a trip is going, in words: a feed's raw sign ("Granite Reef+Indn Sc") gives way to the real last stop. */
export const toward = (d) => (/[+/]/.test(d.headsign) || !d.headsign ? place(d.lastName) : d.headsign);

/** A timetable's day names in running text: "weekdays", "Saturdays", "Monday to Thursday". */
export function dayPhrase(label) {
  return ({ 'Monday to Friday': 'weekdays', Saturday: 'Saturdays', Sunday: 'Sundays', 'Saturday and Sunday': 'weekends', 'Every day': 'every day' })[label] || label;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function shortDate(iso) { const d = new Date(`${iso}T12:00:00Z`); return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; }
export function longDate(iso) { const d = new Date(`${iso}T12:00:00Z`); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }

/** Badge text colour, chosen for contrast on the operator's route colour. */
export function badgeStyle(color) {
  const hex = /^#?([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!hex) return '';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return `--badge:var(--r-${hex[1].toLowerCase()});--badge-ink:var(--color-${1.05 / (L + 0.05) >= (L + 0.05) / 0.0585 ? 'paper' : 'ink'})`;
}

/** The first and last departure on a weekday, from a route's first direction. */
export function weekdayRange(p) {
  const dir = p.dirs[0];
  const day = p.days.find((d) => d.days.includes(0));
  const t = day && dir.first[day.key];
  return t?.length ? { first: fmt(t[0]), last: fmt(t.at(-1)) } : null;
}

export function sourceLine(sys) {
  const a = sys.attribution;
  const parts = [`Source: ${a.text}, open data under ${a.license}.`, `Refreshed ${longDate(sys.builtOn)}.`];
  if (sys.feed?.to) parts.push(`The current ${tWord(sys)} runs to ${longDate(sys.feed.to)}.`);
  if (sys.changesOn) parts.push(`Times change on ${longDate(sys.changesOn)}; this page updates when the new ${tWord(sys)} is published.`);
  parts.push(`These are scheduled times; check ${sys.name} for disruptions.`);
  return parts.join(' ');
}

export const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(c.href ? { item: `${SITE}${c.href}` } : {}) })),
});
export const faqLd = (faq) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })),
});

/** First match within `max` characters, else the last. */
export const fit = (max, ...c) => c.find((s) => s.length <= max) ?? c.at(-1);

export { median };
