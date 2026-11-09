// Spherical geometry shared by the renderers. Pure math on [lon, lat] degree
// pairs — no rendering concepts leak in, so every data layer can hand both
// views the same numbers and the flat map and the globe can't disagree about
// where something is.
//
// Trimmed from logistica-oceanica's geo.ts: only what the bare world needs.
// `distanceKm`, `interpolate` (great-circle slerp) and `bearing` live there,
// ready to bring over the day a layer needs arcs or distances.

export type LonLat = [lon: number, lat: number];

const DEG = Math.PI / 180;

/**
 * Place a [lon, lat] on a sphere of the given radius in THREE's coordinate
 * frame (+Y up, +Z toward the camera at lon 0). Used by the 3D globe; kept
 * here so the globe can't drift out of sync with the 2D projections.
 */
export function toVector3([lon, lat]: LonLat, radius = 1): [number, number, number] {
  const p = lat * DEG;
  const l = lon * DEG;
  const c = Math.cos(p);
  return [radius * c * Math.sin(l), radius * Math.sin(p), radius * c * Math.cos(l)];
}
