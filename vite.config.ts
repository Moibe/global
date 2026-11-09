import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // `strictPort` so el proyecto siempre vive en 4700: sin eso Vite se corre al
  // siguiente puerto libre cuando 4700 está ocupado y acabas mirando otra app
  // en esa pestaña.
  server: { port: 4700, strictPort: true },
  preview: { port: 4700, strictPort: true },
  optimizeDeps: {
    // Pre-bundle every client dependency at startup. three and Threlte are only
    // imported by the globe route, so otherwise Vite discovers them on the first
    // visit to /map/globe, re-optimizes mid-session and reloads the page — and
    // the hydration that was in flight dies with "Failed to hydrate: Cannot
    // read properties of undefined (reading 'call')".
    include: [
      'd3-geo',
      'd3-selection',
      'd3-zoom',
      'topojson-client',
      'three',
      '@threlte/core',
      '@threlte/extras',
    ],
  },
});
