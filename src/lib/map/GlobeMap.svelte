<script lang="ts">
  import { Canvas } from '@threlte/core';
  import GlobeScene from './GlobeScene.svelte';

  /**
   * Thin shell around the Threlte canvas: it owns the DOM element and the
   * couple of controls that belong to the camera rather than to the world. All
   * the actual scene graph lives in `GlobeScene`, which must be a child of
   * `<Canvas>` to reach Threlte's context.
   */
  let autoRotate = $state(true);
</script>

<div class="host">
  <Canvas>
    <GlobeScene {autoRotate} />
  </Canvas>
</div>

<div class="tools panel">
  <span class="label">Cámara</span>
  <button class="ctl" aria-pressed={autoRotate} onclick={() => (autoRotate = !autoRotate)}>
    Rotación {autoRotate ? 'auto' : 'libre'}
  </button>
  <span class="sep"></span>
  <span class="label">Arrastra para orbitar · rueda para acercar</span>
</div>

<style>
  .host {
    position: fixed;
    inset: 0;
  }

  .tools {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
