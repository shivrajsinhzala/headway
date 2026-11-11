import { SITE, pages, systems, byDemand, routeLabel } from '../lib/site.js';

/** /llms.txt: what the site is, how its URLs work and its most looked-up pages, for AI assistants. */
export function GET() {
  const routes = pages.filter((p) => p.type === 'route').sort(byDemand).slice(0, 40);
  const journeys = pages.filter((p) => p.type === 'journey').sort(byDemand).slice(0, 20);
  const networks = Object.values(systems).filter((s) => pages.some((p) => p.key === s.key));
  const body = `# Headway

> Independent, readable bus, tram and train timetables for Australia (Brisbane, Adelaide, Melbourne, regional Victoria) and Phoenix, Arizona. Headway shows published scheduled times, not live vehicle locations.

## Scope and source policy

- Times are generated from each operator's official open GTFS schedule data. Every route page names the source, licence, refresh date and the period the timetable covers.
- Use the operator named on each page for disruptions, fares and live arrivals.
- All times use the network's local timezone, on a 12-hour clock.
- Do not describe a scheduled departure as a real-time prediction.
- Site information and corrections: ${SITE}/about

## URL patterns

- Network index: ${SITE}/au/brisbane
- Route timetable: ${SITE}/au/brisbane/route-325
- Stop departures: ${SITE}/us/phoenix/stop/10021 (only published stop codes exist)
- Direct town-to-town trip: ${SITE}/au/adelaide/from/aberfoyle-park/to/adelaide

## Networks

${networks.map((s) => `- [${s.name}](${SITE}${s.url})`).join('\n')}

## Most looked-up route timetables

${routes.map((p) => `- [${routeLabel(p)}: ${p.name}](${SITE}${p.url}) — ${systems[p.key].name}`).join('\n')}

## Direct trips

${journeys.map((p) => `- [${p.fromName} to ${p.toName}](${SITE}${p.url}) — ${systems[p.key].name}`).join('\n')}

## Machine-readable resources

- Sitemap: ${SITE}/sitemap.xml
- Search index: ${SITE}/search.json
- Route-specific JSON is linked from each route's Dataset schema.
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
