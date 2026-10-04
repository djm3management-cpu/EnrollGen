/** Rebuild bundled county SVG paths from public-domain Census boundaries via us-atlas (ISC).
 * Source: https://github.com/topojson/us-atlas (2017 Census cartographic boundaries).
 * No network fetch occurs in the browser. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { stateFromCountyFips } from './sep-data/common.js';
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/prepare_county_map.js /tmp/counties-10m.json');
const topology = JSON.parse(await readFile(source, 'utf8'));
const { scale, translate } = topology.transform;
const arcs = topology.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(point => { x += point[0]; y += point[1]; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
});
function ring(indices) {
  return indices.flatMap((index, position) => {
    const points = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
    return position ? points.slice(1) : points;
  });
}
const grouped = {};
for (const geometry of topology.objects.counties.geometries) {
  const fips = String(geometry.id).padStart(5, '0');
  const state = stateFromCountyFips(fips).state_code;
  if (!state) continue;
  const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs;
  const rings = polygons.flatMap(polygon => polygon.map(ring));
  (grouped[state] ||= []).push({ fips, county: geometry.properties.name, rings });
}
const output = {};
for (const [state, counties] of Object.entries(grouped)) {
  const points = counties.flatMap(county => county.rings.flat());
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const cosine = Math.cos(latitude * Math.PI / 180);
  const project = ([lon, lat]) => [(state === 'AK' && lon > 0 ? lon - 360 : lon) * cosine, -lat];
  const projected = points.map(project);
  const xs = projected.map(point => point[0]), ys = projected.map(point => point[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const factor = Math.min(760 / (Math.max(...xs) - minX), 360 / (Math.max(...ys) - minY));
  output[state] = counties.map(({ fips, county, rings }) => ({ fips, county,
    d: rings.map(points => points.map((point, index) => {
      const [x, y] = project(point);
      return `${index ? 'L' : 'M'}${((x - minX) * factor + 20).toFixed(1)},${((y - minY) * factor + 20).toFixed(1)}`;
    }).join('') + 'Z').join(''),
  }));
}
await mkdir('src/data/countyMaps', { recursive: true });
for (const [state, paths] of Object.entries(output)) await writeFile(`src/data/countyMaps/${state}.json`, JSON.stringify(paths));
console.log(`Wrote ${Object.values(output).flat().length} county paths.`);
