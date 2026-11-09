<script lang="ts">
  import { geoEquirectangular, geoMercator, geoNaturalEarth1, geoPath, geoGraticule10 } from 'd3-geo';
  import type { GeoProjection, GeoPath } from 'd3-geo';
  import { select } from 'd3-selection';
  import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
  import { untrack } from 'svelte';
  import { loadWorld, type Resolution, type WorldGeometry } from './world';

  /**
   * The crisp view. Everything is drawn as vectors at device pixel ratio, so
   * there is no raster to go soft — you can zoom to 48× and the coastline is
   * still a hairline.
   *
   * The static geometry (land, borders, graticule) is baked into `Path2D`
   * objects **once** in un-zoomed projected space, and the d3-zoom transform is
   * applied to the canvas context rather than to the projection. So a frame is
   * a handful of `fill`/`stroke` calls on cached paths, and panning never
   * re-runs the projection over 25k coastline vertices.
   *
   * Unlike logistica-oceanica there is nothing moving on this map yet, so there
   * is no 60 fps loop: a frame is painted only when something changes (zoom,
   * resize, projection, data) and an idle map costs nothing. A layer that
   * animates can ask for frames with `requestDraw()`, or bring the loop back.
   */
  const PROJECTIONS = {
    // `wraps` marks the cylindrical projections — the ones whose left and right
    // edges are the same meridian, so tiling copies of the world side by side
    // produces a seamless, endless map. Natural Earth's rim is a curve; a copy
    // next to it would just look like a second, detached planet.
    equirect: { label: 'Equirect.', make: geoEquirectangular, wraps: true },
    natural: { label: 'Natural', make: geoNaturalEarth1, wraps: false },
    mercator: { label: 'Mercator', make: geoMercator, wraps: true },
  } as const;

  type ProjectionKey = keyof typeof PROJECTIONS;

  /** Above this zoom the 110m coastline starts showing its polygons; swap up. */
  const HI_RES_AT = 3;
  /** Hard cap on tiled world copies, so a pathological transform can't hang a frame. */
  const MAX_COPIES = 4;

  let host = $state.raw<HTMLDivElement>();
  let canvas = $state.raw<HTMLCanvasElement>();
  let projectionKey = $state<ProjectionKey>('equirect');
  let transform = $state.raw<ZoomTransform>(zoomIdentity);
  let resolution = $state<Resolution>('110m');

  // Plain locals, not runes: these are read only when painting and rebuilt
  // imperatively. Making them reactive would re-run effects for no gain.
  let width = 0;
  let height = 0;
  let dpr = 1;
  let projection: GeoProjection | null = null;
  let path: GeoPath | null = null;
  let world: WorldGeometry | null = null;
  let landPath: Path2D | null = null;
  let coastPath: Path2D | null = null;
  let bordersPath: Path2D | null = null;
  let graticulePath: Path2D | null = null;
  // Projected extent of one whole world, in un-zoomed path space. `worldWidth`
  // is the tiling step for the repeated world.
  let worldX0 = 0;
  let worldWidth = 0;
  let worldY0 = 0;
  let worldY1 = 0;
  // Kept so `resetView` can drive the *same* behaviour instance — recreating one
  // just to call `.transform` would leave the live behaviour's internal state
  // stale and the next wheel tick would snap back to the old zoom.
  let zoomBehaviour: ReturnType<typeof d3zoom<HTMLCanvasElement, unknown>> | null = null;
  /** Id of the queued paint, 0 when none is pending. */
  let frame = 0;

  const wraps = $derived(PROJECTIONS[projectionKey].wraps);

  /** Rebuild the projection for the current size and re-bake every static path. */
  function rebuild() {
    if (!width || !height) return;
    projection = PROJECTIONS[projectionKey].make();
    projection.fitExtent(
      [
        [12, 12],
        [width - 12, height - 12],
      ],
      { type: 'Sphere' }
    );
    path = geoPath(projection);

    const left = projection([-180, 0]);
    const right = projection([180, 0]);
    worldX0 = left ? left[0] : 0;
    worldWidth = left && right ? Math.abs(right[0] - left[0]) : width;
    const bounds = path.bounds({ type: 'Sphere' });
    worldY0 = bounds[0][1];
    worldY1 = bounds[1][1];

    applyTranslateExtent();
    bakeStatic();
  }

  /**
   * Fence the camera to the world. Vertically always — dragging the planet off
   * into empty space is never useful. Horizontally only when the projection
   * doesn't wrap; the tiled ones are meant to pan forever.
   */
  function applyTranslateExtent() {
    if (!zoomBehaviour) return;
    const extent: [[number, number], [number, number]] = wraps
      ? [
          [-Infinity, worldY0],
          [Infinity, worldY1],
        ]
      : [
          [worldX0, worldY0],
          [worldX0 + worldWidth, worldY1],
        ];
    zoomBehaviour.translateExtent(extent);
  }

  function bakeStatic() {
    if (!path) return;
    graticulePath = new Path2D(path(geoGraticule10()) ?? '');
    if (world) {
      // Land is filled from its polygons but stroked from `coastline`: see
      // `WorldGeometry.coastline` for the seams that stroking polygons draws.
      landPath = new Path2D(path(world.land) ?? '');
      coastPath = new Path2D(path(world.coastline) ?? '');
      bordersPath = new Path2D(path(world.borders) ?? '');
    }
  }

  // ---- camera -------------------------------------------------------------

  /**
   * The lon/lat under the middle of the screen, or null when that spot is off
   * the planet (Natural Earth's corners invert to *some* lon/lat that doesn't
   * project back to where it came from). Copies of a tiled world project back
   * whole world widths away, which still counts as the same place.
   */
  function viewCentre(): [number, number] | null {
    if (!projection?.invert || !width || !height) return null;
    const x = transform.invertX(width / 2);
    const y = transform.invertY(height / 2);
    const p = projection.invert([x, y]);
    const q = p ? projection(p) : null;
    if (!p || !q) return null;
    let dx = q[0] - x;
    if (worldWidth > 0) dx -= Math.round(dx / worldWidth) * worldWidth;
    return Math.hypot(dx, q[1] - y) < 0.5 ? p : null;
  }

  /**
   * Put a lon/lat at the middle of the screen at zoom `k`, run through the same
   * constraint a drag obeys (`zoom.transform` skips it, it only guards
   * gestures). With no point it just re-fences the current view.
   *
   * Used after anything that changes what a pan offset means — a new
   * projection, a new canvas size. Reusing the old offset in the new space
   * shows a different place, or none: pan the Equirect. map and pick Natural,
   * and the planet would sit half off-screen.
   */
  function lookAt(lonLat: [number, number] | null, k: number) {
    if (!canvas || !zoomBehaviour || !projection) return;
    const p = lonLat ? projection(lonLat) : null;
    let next = p
      ? zoomIdentity.translate(width / 2 - k * p[0], height / 2 - k * p[1]).scale(k)
      : transform;
    next = zoomBehaviour.constrain()(
      next,
      [
        [0, 0],
        [width, height],
      ],
      zoomBehaviour.translateExtent()
    );
    select(canvas).call(zoomBehaviour.transform, next);
  }

  /**
   * The horizontal offsets, in un-zoomed path units, at which a copy of the
   * world is currently on screen. The static paths are drawn once per entry,
   * which is what makes the cylindrical projections feel endless. Anything a
   * future layer draws (and hit-tests) must iterate over this same list.
   */
  function worldOffsets(): number[] {
    if (!wraps || worldWidth <= 0) return [0];
    const xMin = transform.invertX(0);
    const xMax = transform.invertX(width);
    const first = Math.ceil((xMin - (worldX0 + worldWidth)) / worldWidth);
    const last = Math.floor((xMax - worldX0) / worldWidth);
    const out: number[] = [];
    for (let n = Math.max(first, -MAX_COPIES); n <= Math.min(last, MAX_COPIES); n++) {
      out.push(n * worldWidth);
    }
    return out.length ? out : [0];
  }

  // ---- drawing ------------------------------------------------------------

  /** Queue one paint for the next frame; any number of calls before it coalesce. */
  function requestDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !projection) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // ---- ocean ----------------------------------------------------------
    const sea = ctx.createLinearGradient(0, 0, 0, height);
    sea.addColorStop(0, '#061225');
    sea.addColorStop(0.55, '#04101f');
    sea.addColorStop(1, '#020a14');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, width, height);

    const k = transform.k;

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(k, k);
    ctx.lineJoin = 'round';

    for (const ox of worldOffsets()) {
      ctx.save();
      ctx.translate(ox, 0);

      // Line widths are divided by `k` so strokes keep a constant on-screen
      // thickness at any zoom — the context is scaled, the hairline isn't.

      // ---- graticule ----------------------------------------------------
      if (graticulePath) {
        ctx.strokeStyle = 'rgba(96, 160, 220, 0.10)';
        ctx.lineWidth = 0.5 / k;
        ctx.stroke(graticulePath);
      }

      // ---- land ---------------------------------------------------------
      if (landPath) {
        ctx.fillStyle = '#0c1a2b';
        ctx.fill(landPath);
      }
      if (coastPath) {
        ctx.strokeStyle = 'rgba(120, 190, 255, 0.34)';
        ctx.lineWidth = 0.7 / k;
        ctx.stroke(coastPath);
      }
      if (bordersPath) {
        ctx.strokeStyle = 'rgba(120, 190, 255, 0.10)';
        ctx.lineWidth = 0.5 / k;
        ctx.stroke(bordersPath);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // ---- lifecycle --------------------------------------------------------

  $effect(() => {
    // Size tracking. The canvas backing store is kept at devicePixelRatio so
    // hairlines land on real device pixels instead of being resampled.
    if (!host || !canvas) return;
    const observer = new ResizeObserver(() => {
      // Read before the size changes: it needs the old projection and size.
      const centre = viewCentre();
      const rect = host!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      rebuild();
      lookAt(centre, transform.k);
      // Resizing the backing store wipes it. Paint now, inside the observer
      // callback (before the browser paints), instead of queueing a frame —
      // otherwise every resize flashes one empty frame.
      draw();
    });
    observer.observe(host);
    return () => observer.disconnect();
  });

  $effect(() => {
    // Rebake when the projection choice changes, and keep looking at the same
    // place. `projectionKey` is the only dependency: the rest is untracked
    // because `lookAt` writes `transform`, which this effect reads.
    projectionKey;
    untrack(() => {
      const centre = viewCentre(); // still the old projection here
      rebuild();
      lookAt(centre, transform.k);
      requestDraw();
    });
  });

  $effect(() => {
    // Coastline resolution follows the zoom level; each file is fetched once.
    let cancelled = false;
    loadWorld(resolution).then((w) => {
      if (cancelled) return;
      world = w;
      bakeStatic();
      requestDraw();
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!canvas) return;
    zoomBehaviour = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 48])
      .on('zoom', (event) => {
        transform = event.transform;
        // Only ever step up in detail — dropping back to 110m on zoom-out would
        // pop the coastline every time you scrub the wheel.
        if (transform.k >= HI_RES_AT && resolution === '110m') resolution = '50m';
        requestDraw();
      });
    const selection = select(canvas);
    selection.call(zoomBehaviour);
    // Untracked: `applyTranslateExtent` reads `wraps`, and the projection
    // effect already re-fences on a projection change. Tracking it here would
    // tear down and rebuild the whole zoom behaviour every time.
    untrack(applyTranslateExtent);
    return () => {
      selection.on('.zoom', null);
      zoomBehaviour = null;
    };
  });

  $effect(() => () => {
    if (frame) cancelAnimationFrame(frame);
  });

  function resetView() {
    if (!canvas || !zoomBehaviour) return;
    select(canvas).call(zoomBehaviour.transform, zoomIdentity);
  }
</script>

<div class="host" bind:this={host}>
  <canvas bind:this={canvas}></canvas>
</div>

<div class="tools panel">
  {#each Object.entries(PROJECTIONS) as [key, p] (key)}
    <button
      class="ctl"
      aria-pressed={projectionKey === key}
      onclick={() => (projectionKey = key as ProjectionKey)}
    >
      {p.label}
    </button>
  {/each}
  <span class="sep"></span>
  <span class="label mono">{transform.k.toFixed(1)}× · {resolution}</span>
  <button class="ctl" onclick={resetView}>Reencuadrar</button>
</div>

<style>
  .host {
    position: fixed;
    inset: 0;
  }

  canvas {
    display: block;
    cursor: grab;
    touch-action: none;
  }

  canvas:active {
    cursor: grabbing;
  }

  .tools {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
  }

  .tools .ctl {
    padding: 0.3rem 0.6rem;
    font-size: 0.72rem;
  }

  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--line);
    margin: 0 0.25rem;
  }

  @media (max-width: 900px) {
    .tools {
      display: none;
    }
  }
</style>
