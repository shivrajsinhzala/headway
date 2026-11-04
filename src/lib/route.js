/** A route page's words and figures, all computed from its timetable. Nothing here is typed by hand. */
import { fmt, median, span, hourLabel } from './time.js';
import { systems, tWord, modeFor, vehicleFor, pluralOf, routeLabel, place, toward, dayPhrase, cityOf, fit, shortDate, cap } from './site.js';

const PERIODS = [
  ['Before 7am', 0, 420],
  ['7am to 9am', 420, 540],
  ['9am to 3pm', 540, 900],
  ['3pm to 6pm', 900, 1080],
  ['After 6pm', 1080, 4320],
];

const gapsOf = (t) => t.slice(1).map((x, i) => x - t[i]);

/** A day's times in a direction: at the first stop, or where that day's service actually starts. */
const tf = (dir, key) => (dir.first[key]?.length ? dir.first[key] : dir.later?.[key]?.times || []);
const fromName = (dir, key) => place(dir.first[key]?.length ? dir.firstName : dir.later?.[key]?.name || dir.firstName);

/** The day a direction runs most: the fairest day for frequency and gap figures. */
const busiestDay = (dir, days) => [...days].sort((a, b) => tf(dir, b.key).length - tf(dir, a.key).length)[0];

function freqCell(t, vs, v) {
  if (!t.length) return `no ${vs}`;
  if (t.length === 1) return `1 ${v}`;
  return `about every ${median(gapsOf(t))} min`;
}

export function routeView(p) {
  const sys = systems[p.key];
  const word = tWord(sys);
  const mode = modeFor(p.routeType, sys);
  const v = vehicleFor(p.routeType, sys);
  const vs = pluralOf(v);
  const label = routeLabel(p);
  const dirs = p.dirs;
  const main = dirs[0];
  const city = cityOf(sys);

  /* ---------- names ---------- */
  const core = p.name.replace(/\s+-\s+/g, ' to ').replace(/\s+via\s+.*$/i, '').replace(/\s*\(.*\)$/, '').trim();
  const via = /\svia\s+(.+)$/i.exec(p.name)?.[1];
  const hasEnds = / to /.test(core);
  const ref = p.short || label;
  const h1 = p.short
    ? hasEnds ? `${p.short} ${mode} ${word}: ${core}` : `${p.short} ${core} ${mode} ${word}`
    : `${core} ${mode} ${word}`;
  const title = fit(60, sys.cc === 'us' ? `${h1}, ${city}` : h1, h1, `${p.short || core} ${mode} ${word}, ${city}`, `${ref} ${mode} ${word}`);

  /* ---------- the opening answer ---------- */
  const a = place(main.firstName), b = place(main.lastName);
  const lead = dirs.length === 1 && a === b ? `${label} is a loop from ${a}${via ? ` via ${via}` : ''}.`
    : !hasEnds && sys.cc === 'us' ? `${label} runs along ${core}, between ${a} and ${b}.`
    : `${label} runs between ${a} and ${b}${via ? ` via ${via}` : ''}.`;
  const openDay = p.days.find((d) => main.first[d.key]?.length) || p.days[0];
  const openT = main.first[openDay.key] || [];
  const openSentence = openT.length ? `On ${dayPhrase(openDay.label)} the first ${v} leaves ${a} at ${fmt(openT[0])} and the last at ${fmt(openT.at(-1))}.` : '';
  const description = fit(160,
    `${h1}. ${openSentence} See the whole day by hour at any stop, how often it runs and every stop on the route.`,
    `${h1}. ${openSentence} The whole day by hour at any stop.`,
    `${h1}. ${openSentence}`,
    `${p.short || core} ${mode} ${word}. ${openSentence}`,
    `${openSentence} The whole day by hour at any stop.`);

  /* ---------- how often ---------- */
  const busy = busiestDay(main, p.days);
  const dirCols = dirs.slice(0, 2);
  const freq = [];
  for (const [name, lo, hi] of PERIODS) {
    const cells = dirCols.map((d) => tf(d, busy.key).filter((t) => t >= lo && t < hi));
    if (cells.some((c) => c.length)) freq.push({ name, group: dayPhrase(busy.label), cells: cells.map((c) => freqCell(c, vs, v)) });
  }
  const otherDays = p.days.filter((d) => d.key !== busy.key).map((d) => ({
    name: cap(dayPhrase(d.label)),
    cells: dirCols.map((dir) => { const t = tf(dir, d.key); return t.length ? `${t.length} ${t.length === 1 ? v : vs}, ${freqCell(t, vs, v)}` : `no ${vs}`; }),
  }));
  const daily = dirCols.map((d) => tf(d, busy.key).length);
  const ends = dirCols.map((d) => {
    const last = [...d.stops].reverse().find((s) => s.min != null);
    return last?.min ? span(last.min) : null;
  });

  /* ---------- when to watch out ---------- */
  const watch = [];
  for (const d of dirCols) {
    const t = tf(d, busy.key);
    if (t.length < 4) continue;
    const gaps = gapsOf(t);
    const limit = Math.max(45, 1.75 * median(gaps));
    const big = gaps.map((g, i) => ({ g, from: t[i], to: t[i + 1] })).filter((x) => x.g >= limit).sort((x, y) => y.g - x.g).slice(0, 2).sort((x, y) => x.from - y.from);
    for (const x of big) watch.push(`${cap(dayPhrase(busy.label))}, no ${v} leaves ${place(d.firstName)} between ${fmt(x.from)} and ${fmt(x.to)}. Miss the ${fmt(x.from)} and you wait ${span(x.g)}.`);
    if (!big.length) watch.push(`${cap(dayPhrase(busy.label))}, there is no long gap from ${place(d.firstName)}: the longest wait is ${span(Math.max(...gaps))}.`);
    watch.push(`The last ${v} from ${place(d.firstName)} on ${dayPhrase(busy.label)} leaves at ${fmt(t.at(-1))}.`);
  }
  const allDayNums = new Set(p.days.flatMap((d) => d.days));
  const missing = [[5, 'Saturday'], [6, 'Sunday']].filter(([n]) => !allDayNums.has(n)).map(([, name]) => name);
  if (missing.length) watch.push(`${cap(label)} doesn’t run on ${missing.join(' or ')}.`);

  const busyTimes = tf(main, busy.key);
  const hours = busyTimes.map((t) => Math.floor(t / 60));
  const bars = [];
  const most = hours.length ? Math.max(...[...new Set(hours)].map((h) => hours.filter((x) => x === h).length)) : 1;
  if (hours.length) for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
    const n = hours.filter((x) => x === h).length;
    bars.push({ h, n, tick: hourLabel(h).replace(/[ap]m$/, ''), height: n ? Math.round((n / most) * 100) : 100, gap: !n });
  }
  const barsAria = `${cap(vs)} per hour leaving ${a}, ${dayPhrase(busy.label)}: ${bars.map((x) => `${hourLabel(x.h)} ${x.n}`).join(', ')}.`;

  /* ---------- holiday changes ---------- */
  const runsText = (e) => (e.runs === 'none' ? `no ${vs}` : e.runs === 'special' ? `a special ${word}; check ${sys.name}` : `the ${p.days.find((d) => d.key === e.runs)?.label || 'usual'} ${word}`);
  const holidays = p.exceptions.map((e) => ({ when: `${e.holiday ? `${e.holiday}, ` : ''}${shortDate(e.date)}`, what: runsText(e) }));

  /* ---------- questions ---------- */
  const eachDay = (pick) => p.days.flatMap((d) => {
    const parts = dirCols.flatMap((dir) => {
      const t = tf(dir, d.key);
      return t.length ? [`${pick(t)} from ${fromName(dir, d.key)}`] : [];
    });
    return parts.length ? [`${cap(dayPhrase(d.label))}: ${parts.join(' and ')}`] : [];
  }).join('. ');
  const faq = [
    { q: `What time is the first ${ref} ${v}?`, a: `${eachDay((t) => fmt(t[0]))}.` },
    { q: `What time is the last ${ref} ${v}?`, a: `${eachDay((t) => fmt(t.at(-1)))}.` },
    { q: `How often does the ${ref} run?`, a: [
      busyTimes.length > 1 ? `About every ${median(gapsOf(busyTimes))} minutes on ${dayPhrase(busy.label)}, with ${daily[0]} ${vs} a day from ${a}.` : `One ${v} a day on ${dayPhrase(busy.label)} from ${a}.`,
      ...otherDays.map((d) => `${d.name}: ${d.cells[0]}.`),
    ].join(' ') },
  ];
  if (ends[0]) faq.push({ q: `How long does the ${ref} take?`, a: `About ${ends[0]} from ${a} to ${b}, with ${main.stops.length} stops along the way.${ends[1] ? ` About ${ends[1]} the other way.` : ''}` });
  faq.push({ q: `Does the ${ref} run at weekends?`, a: missing.length === 2 ? `No. ${label} doesn’t run on Saturday or Sunday.` : missing.length === 1 ? `${label} doesn’t run on ${missing[0]}. It runs on the other weekend day: see the table above.` : `Yes. ${otherDays.filter((d) => /sat|sun|weekend/i.test(d.name)).map((d) => `${d.name}: ${d.cells[0]}.`).join(' ') || `It runs at weekends on the ${dayPhrase(busy.label)} ${word}.`}` });
  if (holidays.length) faq.push({ q: `Does the ${ref} run on public holidays?`, a: holidays.slice(0, 4).map((h) => `${h.when}: ${h.what}.`).join(' ') });
  faq.push({ q: 'Are these live times?', a: `No. They are ${sys.name}’s published ${word}, and a ${v} can run early or late. Check ${sys.name} for disruptions.` });

  return { sys, word, mode, v, vs, label, h1, title, description, lede: [lead, openSentence].filter(Boolean).join(' '), a, b, ref, openDay, openT, busy, dirCols, freq, otherDays, daily, ends, watch: [...new Set(watch)], bars, barsAria, holidays, faq };
}
