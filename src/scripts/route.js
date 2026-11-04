/** Route page: the stop picker, the next departure and the marked cell. The page reads fine without this. */
import { fmt, gridHtml, nowIn, upcoming } from '../lib/time.js';

const D = JSON.parse(document.getElementById('page-data').textContent);
const sheets = [...document.querySelectorAll('[data-sheet]')];
const state = D.dirs.map((d) => ({ code: d.firstCode, times: d.first }));
let active = 0;
let allStops = null;

const $ = (root, sel) => root.querySelector(sel);
const hero = { label: $(document, '[data-next-label]'), time: $(document, '[data-next-time]'), more: $(document, '[data-next-more]') };

const stopName = (i) => {
  const sel = $(sheets[i], '[data-stop-select]');
  return sel?.options[sel.selectedIndex]?.text.replace(/,?\s+platform\s+\S+$/i, '') ?? '';
};

function paintHero() {
  const now = nowIn(D.tz);
  const u = upcoming(state[active].times, D.days, D.exceptions, now);
  const name = stopName(active);
  if (u.today === 'special' && !u.list.length) {
    hero.label.textContent = `Special ${D.v === 'bus' ? 'bus' : D.v} times today`;
    hero.time.textContent = 'Check first';
    hero.more.textContent = `${D.operator} is running a special timetable today.`;
  } else if (u.list.length) {
    const [n, ...rest] = u.list;
    const wait = n.at - now.min;
    hero.label.textContent = `Next from ${name}`;
    hero.time.textContent = fmt(n.at);
    const lead = wait < 1 ? 'due now' : wait < 90 ? `in ${wait} min` : `in ${Math.floor(wait / 60)}h ${wait % 60}m`;
    hero.more.textContent = [lead, rest.length ? `then ${rest.slice(0, 2).map((x) => fmt(x.at)).join(', ')}` : 'last today'].join(', ');
  } else {
    hero.label.textContent = `No more today from ${name}`;
    hero.time.textContent = u.tomorrowFirst != null ? fmt(u.tomorrowFirst) : 'None';
    hero.more.textContent = u.tomorrowFirst != null ? 'first tomorrow' : `no ${D.vs} tomorrow`;
  }
  return u;
}

function markNext(i) {
  const sheet = sheets[i];
  sheet.querySelectorAll('.m.next').forEach((m) => { m.classList.remove('next'); m.removeAttribute('aria-current'); });
  const u = upcoming(state[i].times, D.days, D.exceptions, nowIn(D.tz));
  const n = u.list[0];
  if (!n) return;
  const cell = sheet.querySelector(`td[data-day="${CSS.escape(n.key)}"] .m[data-t="${n.t}"]`);
  if (cell) { cell.classList.add('next'); cell.setAttribute('aria-current', 'time'); }
}

function refresh() {
  paintHero();
  sheets.forEach((_, i) => markNext(i));
}

async function loadStops() {
  if (!allStops) {
    const res = await fetch(D.dataUrl);
    if (!res.ok) throw new Error(String(res.status));
    allStops = (await res.json()).dirs;
  }
  return allStops;
}

async function chooseStop(i, code) {
  const sheet = sheets[i];
  const note = $(sheet, '[data-sheet-note]');
  const select = $(sheet, '[data-stop-select]');
  select.value = code;
  note.textContent = '';
  try {
    const times = (await loadStops())[i]?.[code];
    if (!times) throw new Error('no times');
    state[i] = { code, times };
    $(sheet, '[data-grid]').innerHTML = gridHtml(D.days, times, D.vs);
    active = i;
    refresh();
  } catch {
    select.value = state[i].code;
    note.textContent = 'That stop could not load. Check your connection and try again.';
  }
}

function showDirection(i) {
  sheets.forEach((s, n) => s.classList.toggle('off-phone', n !== i));
  document.querySelectorAll('[data-dir-btn]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.dirBtn) === i)));
  active = i;
  refresh();
}

/* ---------- wire up, and reveal what only works with scripts ---------- */
document.querySelectorAll('[data-picker], [data-print], .stop-go').forEach((el) => { el.hidden = false; });

sheets.forEach((sheet, i) => {
  $(sheet, '[data-stop-select]')?.addEventListener('change', (e) => chooseStop(i, e.target.value));
});
document.querySelectorAll('[data-dir-btn]').forEach((b) => b.addEventListener('click', () => showDirection(Number(b.dataset.dirBtn))));
document.querySelector('[data-print]')?.addEventListener('click', () => window.print());
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-go-stop]');
  if (!b) return;
  const i = Number(b.dataset.goDir);
  showDirection(i);
  chooseStop(i, b.dataset.goStop);
  sheets[i].scrollIntoView({ block: 'start' });
});

// On a wide screen both stop lists fit side by side, so open them all.
if (window.matchMedia('(min-width: 900px)').matches) document.querySelectorAll('[data-stop-list]').forEach((d) => { d.open = true; });

// A stop page links here as #stop-<code>: open that stop straight away.
const fromHash = /^#stop-(.+)$/.exec(window.location.hash);
if (fromHash) {
  const code = decodeURIComponent(fromHash[1]);
  const i = sheets.findIndex((s) => [...($(s, '[data-stop-select]')?.options || [])].some((o) => o.value === code));
  if (i >= 0) { showDirection(i); chooseStop(i, code); sheets[i].scrollIntoView({ block: 'start' }); }
}

refresh();
setInterval(refresh, 30000);
