# Global

Webapp para ver el mundo y desplegar datos encima **por capas**: políticos, económicos,
logísticos, etc. Primer paso: el mundo solo, sin elementos encima, en dos vistas
intercambiables.

Scaffold basado en [`logistica-oceanica`](https://github.com/Moibe/logistica-oceanica):
mismo stack, misma paleta, mismos datos geográficos. De ahí se tomaron **solo** las vistas
Canvas 2D y Globo 3D, sin barcos, puertos, rutas, reloj ni HUD.

Stack: SvelteKit 2 + Svelte 5 en modo runes + TypeScript + d3-geo / d3-zoom para el mapa
plano y Threlte 8 / three para el globo. Canvas a pantalla completa con paneles de vidrio
flotando encima.

Las versiones mayores son **las mismas que en `logistica-oceanica`** (Kit 2, TypeScript 6,
Vite 8, three 0.185), a propósito, aunque ya existan Kit 3 y TypeScript 7: así el código
pasa de un proyecto al otro sin migraciones. Migrar es una decisión aparte.

## Arranque

```sh
npm install
npm run dev   # http://localhost:4700
```

El puerto es fijo (`strictPort` en `vite.config.ts`): si 4700 está ocupado el dev server
falla en vez de saltar al siguiente libre.

| Comando         | Qué hace                              |
| --------------- | ------------------------------------- |
| `npm run dev`   | Servidor de desarrollo                |
| `npm run build` | Build de producción (`adapter-auto`)  |
| `npm run check` | `svelte-check` sobre todo el proyecto |

## Las dos vistas

| Ruta          | Stack             | Qué hace                                                                                         |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| `/map/canvas` | d3-geo + Canvas2D | Proyección real dibujada como vectores a devicePixelRatio. Zoom 48×, tres proyecciones, cambio a costa 50m al acercar, mundo repetido en las cilíndricas. |
| `/map/globe`  | Threlte + three   | El mismo mundo sobre una esfera: costas y fronteras en líneas, atmósfera y estrellas. Rotación automática u órbita libre. |

`/` redirige a `/map/canvas`: no hay página de inicio, la app es el mapa.

### Canvas 2D (`src/lib/map/CanvasMap.svelte`)

- La geometría estática (tierra, fronteras, retícula) se hornea en `Path2D` **una sola vez**
  en espacio proyectado sin zoom, y el transform de `d3-zoom` se aplica al **contexto** del
  canvas, no a la proyección: un pan nunca vuelve a proyectar los vértices de la costa.
- Grosores de línea divididos entre `k` para que el trazo mida lo mismo en pantalla a
  cualquier zoom.
- **Mundo repetido** en Equirect. y Mercator: `worldOffsets()` dice qué copias del mundo
  tocan la pantalla y todo se dibuja una vez por copia. Lo que dibuje una capa futura (y su
  hit-test) tiene que iterar sobre esa misma lista.
- **Cambiar de proyección o de tamaño de ventana conserva el lugar**: el lon/lat que está al
  centro de la pantalla vuelve al centro, con el mismo zoom, pasando por la misma
  restricción que un arrastre (`viewCentre()` + `lookAt()`).
- **Pinta bajo demanda**, no a 60 fps: un cuadro solo se dibuja cuando algo cambia (zoom,
  tamaño, proyección, datos). En `logistica-oceanica` el loop continuo existía porque los
  barcos se mueven; aquí no se mueve nada todavía y un mapa quieto no debe gastar CPU. Una
  capa animada puede pedir cuadros con `requestDraw()` o recuperar el loop.

### Globo 3D (`src/lib/map/GlobeScene.svelte`)

- Sin proyección: un `[lon, lat]` va directo a la esfera con `toVector3` de
  `src/lib/domain/geo.ts`, así que las dos vistas no pueden discrepar sobre dónde está una
  costa.
- Radios en capas fijas para que nada haga z-fighting: océano 1.000, costa y fronteras
  1.002, atmósfera 1.045. Las capas de datos van en medio (logistica-oceanica usó
  1.004–1.012).
- Materiales sin iluminación, así que la escena no lleva luces. Threlte renderiza bajo
  demanda: con la rotación apagada y sin tocar el globo, no se dibujan cuadros.

## Arquitectura

```
src/lib/
  domain/          TypeScript puro, sin nada de UI ni de render
    geo.ts         tipo LonLat y lon/lat → vec3
  map/             los dos renderers + carga de TopoJSON
    world.ts       carga perezosa y cacheada de costas (110m / 50m) y fronteras
    CanvasMap.svelte
    GlobeMap.svelte · GlobeScene.svelte · globeGeometry.ts
  ui/
    ViewNav.svelte navegación entre vistas
```

La regla que se hereda de `logistica-oceanica` y que conviene sostener al meter capas:
**`domain/` no conoce ningún renderer.** Una capa de datos devuelve `[lon, lat]`, ids de
país y valores; cada vista decide cómo dibujarlos. Así el mapa plano y el globo muestran
siempre lo mismo.

### Datos geográficos

`static/data/` lleva el TopoJSON de `world-atlas` copiado en el scaffold:
`land-110m.json`, `land-50m.json` y `countries-110m.json`. No hay tiles, ni proveedor, ni
API key: el mapa funciona sin red.

## Detalles que conviene no romper

- **La tierra se rellena con polígonos pero la costa se traza con líneas**
  (`WorldGeometry.coastline`). En una proyección plana d3 recorta la Antártida —el único
  anillo que encierra un polo— en el antimeridiano y la cierra por ese meridiano y por el
  polo para poder rellenarla; trazar ese mismo path dibuja esos cierres como costa falsa: una
  raya en el borde inferior del mapa y una costura vertical en la Antártida donde se juntan
  las copias del mundo repetido. Las líneas se recortan sin cierres. Además
  `dropMeridianCuts()` quita los pocos tramos que world-atlas dejó cortados sobre ±180°
  (isla Wrangel en 110m, Fiyi en 50m y en la malla de países). Aplica igual a las capas de
  polígonos que vengan (países): rellenar el polígono, trazar su contorno como líneas.
- **`optimizeDeps.include` en `vite.config.ts`.** three y Threlte solo los importa la ruta
  del globo; sin pre-empaquetarlos al arrancar, Vite los descubre en la primera visita a
  `/map/globe`, re-optimiza y recarga a media hidratación ("Failed to hydrate: Cannot read
  properties of undefined (reading 'call')").
- **three se queda en 0.185.** Con 0.187 el servidor imprime `THREE_CJS_DEPRECATED`: en SSR,
  `@threlte/extras` → `@threejs-kit/instanced-sprite-mesh` → `maath`, que no tiene mapa de
  `exports`, así que Node carga su build CommonJS y hace `require("three")`. No rompe nada;
  subir cuando `maath` publique `exports`.
- **`feature()` de topojson-client sobre `objects.land` devuelve un `FeatureCollection`, no
  un `Feature`** (world-atlas guarda esos objetos como GeometryCollection). `geoPath` traga
  los dos y disimula el error; el código que toca `.geometry.coordinates` truena.
- La resolución de la costa **solo sube** (110m → 50m, al pasar de 3×). Bajar al alejar
  haría que la costa "brinque" cada vez que mueves la rueda.

## Siguiente

- Primera capa: **política** — países como polígonos (`countries-110m.json` ya trae los
  objetos `countries` con id ISO numérico), relleno por país, hover y nombre.
- Un selector de capas común a las dos vistas.
- Capas económicas y logísticas encima del mismo dominio.
