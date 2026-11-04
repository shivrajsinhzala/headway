/** Stop page: swaps the first-departures list for what actually leaves next, across every route. */
import { fmt, nowIn, upcoming } from '../lib/time.js';

const D = JSON.parse(document.getElementById('page-data').textContent);
const rows = document.querySelector('[data-board-rows]');
const title = document.querySelector('[data-board-title]');

function paint() {
  const now = nowIn(D.tz);
  const next = D.routes
    .flatMap((r) => upcoming(r.times, r.days, r.exceptions, now).list.slice(0, 6).map((u) => ({ r, at: u.at })))
    .sort((a, b) => a.at - b.at)
    .slice(0, 6);
  if (!next.length) { title.textContent = 'First weekday departures'; return; }
  title.textContent = 'Next departures';
  rows.replaceChildren(...next.map(({ r, at }, i) => {
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'is-next';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = r.short;
    const a = document.createElement('td'); a.append(badge);
    const b = document.createElement('td'); b.textContent = r.headsign;
    const c = document.createElement('td'); c.textContent = fmt(at);
    tr.append(a, b, c);
    return tr;
  }));
}

// Badge text colour for routes the board adds: copy it from the routes table, which the build worked out.
const inkByRoute = new Map([...document.querySelectorAll('.data .badge')].map((el) => [el.textContent.trim(), el.getAttribute('style')]));
const observer = () => rows.querySelectorAll('.badge').forEach((el) => {
  const style = inkByRoute.get(el.textContent.trim());
  if (style) el.setAttribute('style', style);
});

paint();
observer();
setInterval(() => { paint(); observer(); }, 30000);
