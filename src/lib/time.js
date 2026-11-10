/** Clock arithmetic and the hour grid. Runs in the build and in the browser, so no imports. */

export const fmt = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
};

export const hourLabel = (h) => { const x = h % 24; return `${x % 12 || 12}${x >= 12 ? 'pm' : 'am'}`; };

export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** 50 -> '50 min', 110 -> '1h 50m', 120 -> '2h'. */
export const span = (m) => {
  if (m == null) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

export const shortDay = (label) => label
  .replace(/Monday/g, 'Mon').replace(/Tuesday/g, 'Tue').replace(/Wednesday/g, 'Wed').replace(/Thursday/g, 'Thu')
  .replace(/Friday/g, 'Fri').replace(/Saturday/g, 'Sat').replace(/Sunday/g, 'Sun');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Up to three day columns read well on a phone: more day types become a second table, not a sideways scroll. */
export function chunkDays(days) {
  if (days.length <= 3) return [days];
  if (days.length === 4) return [days.slice(0, 2), days.slice(2)];
  const out = [];
  for (let i = 0; i < days.length; i += 3) out.push(days.slice(i, i + 3));
  return out;
}

function table(days, times) {
  const all = days.flatMap((d) => times[d.key] || []);
  const hours = all.map((t) => Math.floor(t / 60));
  const [lo, hi] = [Math.min(...hours), Math.max(...hours)];
  const head = days.map((d) => `<th scope="col" data-day="${esc(d.key)}">${esc(shortDay(d.label))}</th>`).join('');
  const rows = [];
  for (let h = lo; h <= hi; h++) {
    const cells = days.map((d) => {
      const mins = (times[d.key] || []).filter((t) => Math.floor(t / 60) === h);
      return `<td data-day="${esc(d.key)}">${mins.map((t) => `<span class="m" data-t="${t}">:${String(t % 60).padStart(2, '0')}</span>`).join(' ')}</td>`;
    }).join('');
    rows.push(`<tr><th scope="row">${hourLabel(h)}</th>${cells}</tr>`);
  }
  return `<table class="hours"><thead><tr><th scope="col">Hour</th>${head}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

/** The whole day at one stop: rows of hours, minutes past in each day's column, every departure a cell the page can mark. */
export function gridHtml(days, times, vehicles = 'buses') {
  const running = days.filter((d) => (times[d.key] || []).length);
  const idle = days.filter((d) => !(times[d.key] || []).length);
  const tables = running.length ? chunkDays(running).map((c) => table(c, times)).join('') : '';
  const note = idle.length ? `<p class="no-days">No ${esc(vehicles)} from this stop on ${esc(idle.map((d) => d.label).join(' or '))}.</p>` : '';
  return tables + note;
}

const WEEK = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** The date, weekday (Monday = 0) and minute of the day in a network's own time zone. */
export function nowIn(timeZone, at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(at).map((p) => [p.type, p.value]));
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, wd: WEEK[parts.weekday], min: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** A date some days from `now`, keeping the minute. */
export function shiftDay(now, by) {
  const d = new Date(`${now.iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return { iso: d.toISOString().slice(0, 10), wd: (now.wd + by + 70) % 7, min: now.min };
}

/** Which timetable a date runs: a day key, 'none' or 'special'. */
export function keyFor(day, days, exceptions = []) {
  const e = exceptions.find((x) => x.date === day.iso);
  if (e) return e.runs;
  return days.find((d) => d.days.includes(day.wd))?.key ?? 'none';
}

/** What leaves next: the rest of today, with yesterday's after-midnight trips, and tomorrow's first. */
export function upcoming(times, days, exceptions, now) {
  const today = keyFor(now, days, exceptions);
  const yesterday = keyFor(shiftDay(now, -1), days, exceptions);
  const tomorrow = keyFor(shiftDay(now, 1), days, exceptions);
  const list = [
    ...(times[yesterday] || []).filter((t) => t - 1440 >= now.min).map((t) => ({ t, key: yesterday, at: t - 1440 })),
    ...(times[today] || []).filter((t) => t >= now.min).map((t) => ({ t, key: today, at: t })),
  ].sort((a, b) => a.at - b.at);
  let next = null;
  for (let offset = 1; offset <= 7 && !next; offset++) {
    const day = shiftDay(now, offset);
    const key = keyFor(day, days, exceptions);
    const at = (times[key] || [])[0];
    if (at != null) next = { at, iso: day.iso };
  }
  return { today, list, next, tomorrowFirst: (times[tomorrow] || [])[0] ?? null, tomorrowSpecial: tomorrow === 'special' };
}
