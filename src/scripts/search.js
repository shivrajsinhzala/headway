/** Search across the published pages. Small index, filtered in the browser; the query never leaves the page. */
const input = document.getElementById('top-q');
const list = document.querySelector('[data-results]');
const summary = document.querySelector('[data-summary]');

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
let index = [];

function score(item, q, words) {
  if (item.s === q) return 100;
  if (item.s.startsWith(`${q} `)) return 90;
  if (!words.every((w) => item.h.includes(w))) return 0;
  return item.n.startsWith(q) ? 60 : 40;
}

function render(raw) {
  const q = norm(raw);
  list.replaceChildren();
  if (!q) { summary.textContent = 'Type a route number, stop or town in the box at the top.'; return; }
  const words = q.split(' ');
  const hits = index.map((x) => ({ x, s: score(x, q, words) })).filter((r) => r.s).sort((a, b) => b.s - a.s).slice(0, 30);
  summary.textContent = hits.length
    ? `${hits.length === 30 ? 'Top 30' : hits.length} ${hits.length === 1 ? 'match' : 'matches'} for "${raw.trim()}".`
    : `Nothing yet for "${raw.trim()}". Headway adds more routes each week.`;
  list.append(...hits.map(({ x }) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = x.u;
    a.textContent = x.t;
    const small = document.createElement('small');
    small.textContent = x.d;
    a.append(small);
    li.append(a);
    return li;
  }));
}

const initial = new URLSearchParams(window.location.search).get('q') || '';
if (input) {
  input.value = initial;
  if (window.matchMedia('(pointer: fine)').matches) input.focus();
  input.addEventListener('input', () => render(input.value));
  input.form?.addEventListener('submit', (e) => { e.preventDefault(); render(input.value); });
}
fetch('/search.json').then((r) => r.json()).then((items) => {
  index = items.map((i) => ({ ...i, n: norm(i.t), s: norm(i.k), h: norm(`${i.k} ${i.t} ${i.d}`) }));
  render(initial);
}).catch(() => { summary.textContent = 'Search could not load. Check your connection and try again.'; });
