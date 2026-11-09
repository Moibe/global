import { BufferAttribute, BufferGeometry } from 'three';
import { toVector3, type LonLat } from '$lib/domain/geo';
import type { MultiLineString, Position } from 'geojson';

/**
 * GeoJSON → sphere-surface line geometry. The globe view needs no projection at
 * all: a [lon, lat] is just a point on a sphere, so the same coastline data the
 * canvas map projects flat is lifted verbatim onto the mesh, and the two views
 * cannot disagree about where a coast is.
 *
 * Everything comes back as `LineSegments` (disjoint pairs) rather than a
 * `Line`, because a coastline is many disconnected rings and a single strip
 * would draw a stray chord from the end of one ring to the start of the next.
 */
export function ringsToSegments(rings: Position[][], radius: number): BufferGeometry {
  const positions: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      positions.push(...toVector3(ring[i] as LonLat, radius));
      positions.push(...toVector3(ring[i + 1] as LonLat, radius));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  return geometry;
}

/** A coastline or border mesh (`WorldGeometry.coastline` / `.borders`) on the sphere. */
export function lineOutlines(geometry: MultiLineString, radius: number): BufferGeometry {
  return ringsToSegments(geometry.coordinates, radius);
}

/** A field of background stars on a large shell, as a point cloud. */
export function starField(count: number, radius: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere: z uniform in [-1,1], angle uniform in [0, 2π).
    const z = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const d = radius * (0.85 + Math.random() * 0.3);
    positions[i * 3] = d * r * Math.cos(a);
    positions[i * 3 + 1] = d * z;
    positions[i * 3 + 2] = d * r * Math.sin(a);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}
