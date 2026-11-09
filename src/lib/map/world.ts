import { feature, mesh } from 'topojson-client';
import type { FeatureCollection, MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';

/**
 * Coastlines and borders, shared by both renderers. The TopoJSON ships in
 * `static/data` (copied from the `world-atlas` package at scaffold time) so the
 * map works with no network and no tile provider — no API keys, no rate limits,
 * nothing to expire.
 *
 * Two resolutions: 110m is enough for the whole-world view and 50m is swapped in
 * once the canvas zooms past the point where 110m coastlines start to look like
 * a polygon soup. Both are fetched lazily and cached forever.
 */
export type Resolution = '110m' | '50m';

export type WorldGeometry = {
  /**
   * Filled landmasses. This is a FeatureCollection, not a single Feature:
   * world-atlas stores `objects.land` as a TopoJSON GeometryCollection, so
   * `feature()` hands back one Feature per landmass.
   */
  land: FeatureCollection<Polygon | MultiPolygon>;
  /**
   * The same rings as lines, for stroking. Never stroke `land` itself: on a
   * flat projection d3 clips Antarctica — the one ring that encloses a pole —
   * at the antimeridian and closes it along that meridian and the pole so it
   * can be filled. Stroking the filled path draws those closing edges as fake
   * coast: a line along the bottom of the map and a seam through Antarctica
   * wherever two copies of the repeated world meet. Lines get clipped without
   * any closing edge.
   */
  coastline: MultiLineString;
  /** Coastline + shared borders as a single stroke-once mesh (no double-drawn edges). */
  borders: MultiLineString;
};

const cache = new Map<Resolution, Promise<WorldGeometry>>();

export function loadWorld(resolution: Resolution = '110m'): Promise<WorldGeometry> {
  const hit = cache.get(resolution);
  if (hit) return hit;

  const pending = (async (): Promise<WorldGeometry> => {
    // 50m only ships a `land` object in world-atlas' land bundle; countries are
    // only needed for the border mesh, which the low-res file provides fine.
    const [landTopo, countryTopo] = await Promise.all([
      fetchTopology(`/data/land-${resolution}.json`),
      fetchTopology('/data/countries-110m.json'),
    ]);

    const land = feature(
      landTopo,
      landTopo.objects.land as GeometryCollection
    ) as unknown as FeatureCollection<Polygon | MultiPolygon>;

    const borders = mesh(
      countryTopo,
      countryTopo.objects.countries as GeometryCollection
    ) as MultiLineString;

    return {
      land,
      coastline: { type: 'MultiLineString', coordinates: dropMeridianCuts(rings(land)) },
      borders: { type: 'MultiLineString', coordinates: dropMeridianCuts(borders.coordinates) },
    };
  })();

  // A failed fetch must not be cached as the answer forever: drop it so the
  // next call (the next zoom past the threshold, the next mount) retries.
  pending.catch(() => cache.delete(resolution));

  cache.set(resolution, pending);
  return pending;
}

async function fetchTopology(url: string): Promise<Topology> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url}: ${res.status}`);
  return (await res.json()) as Topology;
}

/** Every outer and inner ring of every landmass. */
function rings(land: FeatureCollection<Polygon | MultiPolygon>): Position[][] {
  const out: Position[][] = [];
  for (const f of land.features) {
    const g = f.geometry;
    if (g.type === 'Polygon') out.push(...g.coordinates);
    else for (const polygon of g.coordinates) out.push(...polygon);
  }
  return out;
}

const onAntimeridian = (p: Position) => Math.abs(Math.abs(p[0]) - 180) < 1e-6;

/**
 * Split lines wherever a segment runs along the antimeridian. world-atlas
 * stitches most rings back into proper spherical polygons, but a few are still
 * cut and closed along ±180° — Wrangel Island in 110m, Fiji in 50m and in the
 * country mesh. Those edges belong to the flat file, not to any coast or border.
 */
function dropMeridianCuts(lines: Position[][]): Position[][] {
  const out: Position[][] = [];
  for (const line of lines) {
    let run: Position[] = [line[0]];
    for (let i = 1; i < line.length; i++) {
      if (onAntimeridian(line[i - 1]) && onAntimeridian(line[i])) {
        if (run.length > 1) out.push(run);
        run = [line[i]];
      } else {
        run.push(line[i]);
      }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}
