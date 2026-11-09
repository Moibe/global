<script lang="ts">
  import { T } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import {
    AdditiveBlending,
    BackSide,
    BufferGeometry,
    LineBasicMaterial,
    MeshBasicMaterial,
    PointsMaterial,
    SphereGeometry,
  } from 'three';
  import { loadWorld } from './world';
  import { lineOutlines, starField } from './globeGeometry';

  /**
   * The globe. Same coastlines as the flat view — the only thing that changes
   * is that a [lon, lat] becomes a point on a sphere instead of a point on a
   * projection.
   *
   * Radii are stacked in fixed shells so nothing z-fights: ocean at 1.000,
   * coastline and borders at 1.002, the atmosphere shell at 1.045. Data layers
   * take the shells in between (logistica-oceanica used 1.004–1.012 for lanes,
   * wakes and hulls).
   *
   * Every material is unlit (Basic/LineBasic/Points), so the scene needs no
   * lights. Threlte renders on demand: with nothing animating, frames are only
   * drawn while the camera moves (auto-rotation, a drag, damping settling).
   */
  let { autoRotate = true }: { autoRotate?: boolean } = $props();

  const R = {
    ocean: 1,
    coast: 1.002,
    atmosphere: 1.045,
  };

  let coastGeometry = $state.raw<BufferGeometry | null>(null);
  let borderGeometry = $state.raw<BufferGeometry | null>(null);

  $effect(() => {
    let cancelled = false;
    loadWorld('110m').then((world) => {
      if (cancelled) return;
      coastGeometry = lineOutlines(world.coastline, R.coast);
      borderGeometry = lineOutlines(world.borders, R.coast);
    });
    return () => {
      cancelled = true;
    };
  });

  // ---- static scene resources -------------------------------------------
  // three.js materials and geometries are expensive to churn and none of these
  // depend on reactive state, so they are built once per component instance.

  const oceanGeometry = new SphereGeometry(R.ocean, 96, 96);
  const atmosphereGeometry = new SphereGeometry(R.atmosphere, 64, 64);
  const starGeometry = starField(1400, 14);

  const coastMaterial = new LineBasicMaterial({ color: '#6fc7ff', transparent: true, opacity: 0.75 });
  const borderMaterial = new LineBasicMaterial({ color: '#2f5f8f', transparent: true, opacity: 0.4 });
  const oceanMaterial = new MeshBasicMaterial({ color: '#061627' });
  const atmosphereMaterial = new MeshBasicMaterial({
    color: '#2d8fd6',
    transparent: true,
    opacity: 0.11,
    side: BackSide,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const starMaterial = new PointsMaterial({
    color: '#9fc4e8',
    size: 0.012,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
  });
</script>

<T.PerspectiveCamera makeDefault position={[0, 1.2, 3.2]} fov={38}>
  <OrbitControls
    enableDamping
    dampingFactor={0.06}
    minDistance={1.25}
    maxDistance={7}
    {autoRotate}
    autoRotateSpeed={0.28}
    enablePan={false}
  />
</T.PerspectiveCamera>

<T.Points geometry={starGeometry} material={starMaterial} />

<!-- Ocean sphere + a back-side shell that fakes atmospheric scattering. -->
<T.Mesh geometry={oceanGeometry} material={oceanMaterial} />
<T.Mesh geometry={atmosphereGeometry} material={atmosphereMaterial} />

{#if borderGeometry}
  <T.LineSegments geometry={borderGeometry} material={borderMaterial} />
{/if}
{#if coastGeometry}
  <T.LineSegments geometry={coastGeometry} material={coastMaterial} />
{/if}
