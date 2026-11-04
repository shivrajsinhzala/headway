/** Journey page: the next departure and a strip of the coming days. All days are in the HTML; this only narrows the view. */
import { fmt, nowIn, shiftDay, keyFor } from '../lib/time.js';

const D = JSON.parse(document.getElementById('page-data').textContent);
const strip = document.querySelector('[data-day-strip]');
const notice = document.querySelector('[data-day-notice]');
const cards = [...document.querySelectorAll('[data-day-card]')];
const nextLabel = document.querySelector('[data-next-label]');
const nextTime = document.querySelector('[data-next-time]');

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const tripsOn = (day) => {
  const key = keyFor(day, D.days, D.exceptions);
  return { key, trips: (D.trips[key] || []).filter((t) => !t[2] || t[2].includes(day.wd)) };
};

function paintNext() {
  const now = nowIn(D.tz);
  const today = tripsOn(now);
  const next = today.trips.find((t) => t[0] >= now.min);
  if (next) { nextLabel.textContent = `Next ${D.v}`; nextTime.textContent = fmt(next[0]); return null; }
  for (let by = 1; by <= 7; by++) {
    const day = shiftDay(now, by);
    const { trips } = tripsOn(day);
    if (trips.length) {
      nextLabel.textContent = by === 1 ? 'Next, tomorrow' : `Next, ${WD[day.wd]}`;
      nextTime.textContent = fmt(trips[0][0]);
      return null;
    }
  }
  return null;
}

function choose(day, button) {
  strip.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  const { key, trips } = tripsOn(day);
  notice.hidden = true;
  if (key === 'none' || key === 'special' || !trips.length) {
    notice.hidden = false;
    notice.textContent = key === 'special'
      ? `${D.operator} runs a special timetable that day. Check with them before you travel.`
      : `No direct ${D.vs} that day.`;
  }
  cards.forEach((card) => {
    const on = card.dataset.dayCard === key;
    card.hidden = !on;
    if (!on) return;
    const now = nowIn(D.tz);
    const isToday = day.iso === now.iso;
    let marked = false;
    card.querySelectorAll('tr[data-dep]').forEach((tr) => {
      const only = tr.dataset.only?.split(',').map(Number);
      tr.classList.toggle('is-off', Boolean(only && !only.includes(day.wd)));
      const isNext = isToday && !marked && !tr.classList.contains('is-off') && Number(tr.dataset.dep) >= now.min;
      tr.classList.toggle('next', isNext);
      if (isNext) marked = true;
    });
  });
}

const now = nowIn(D.tz);
const week = Array.from({ length: 7 }, (_, by) => shiftDay(now, by));
strip.append(...week.map((day, by) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-pressed', 'false');
  const bold = document.createElement('b');
  bold.textContent = by === 0 ? 'Today' : WD[day.wd];
  const n = tripsOn(day).trips.length;
  b.append(bold, `${Number(day.iso.slice(8))} ${new Date(`${day.iso}T12:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' })}`, document.createElement('br'), `${n} ${n === 1 ? 'trip' : 'trips'}`);
  b.addEventListener('click', () => choose(day, b));
  return b;
}));
strip.hidden = false;
choose(week[0], strip.querySelector('button'));
paintNext();
setInterval(paintNext, 30000);
