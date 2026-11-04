import { pages, systems, routeLabel } from '../lib/site.js';

/** The search index: t title, d detail, k what a rider types first, u address. */
export function GET() {
  const items = [
    ...Object.values(systems).map((s) => ({ t: s.name, d: s.area, k: s.name, u: s.url })),
    ...pages.map((p) => {
      const sys = systems[p.key];
      if (p.type === 'route') return { t: `${routeLabel(p)}: ${p.name.replace(/\s+-\s+/g, ' to ')}`, d: sys.name, k: p.short || p.name, u: p.url };
      if (p.type === 'stop') return { t: p.name, d: `Stop ${p.code}, ${sys.name}`, k: p.code, u: p.url };
      return { t: `${p.fromName} to ${p.toName}`, d: sys.name, k: `${p.fromName} ${p.toName}`, u: p.url };
    }),
  ];
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}
