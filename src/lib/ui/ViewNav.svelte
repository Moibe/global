<script lang="ts">
  import { page } from '$app/state';

  /**
   * The view switcher. Two renderers of the same world — a flat projection and
   * a sphere — fed by the same coastline data, so switching never changes where
   * anything is.
   */
  const VIEWS = [
    { href: '/map/canvas', label: 'Canvas 2D', hint: 'd3-geo · nítido' },
    { href: '/map/globe', label: 'Globo 3D', hint: 'three · arcos' },
  ];
</script>

<nav class="panel">
  <a class="brand" href="/">
    <span class="dot"></span>
    <span class="mono">GLOBAL</span>
  </a>
  <div class="views">
    {#each VIEWS as view (view.href)}
      <a
        class="ctl"
        class:is-active={page.url.pathname === view.href}
        href={view.href}
      >
        <span>{view.label}</span>
        <span class="hint">{view.hint}</span>
      </a>
    {/each}
  </div>
</nav>

<style>
  nav {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 1.1rem;
    padding: 0.5rem 0.75rem 0.5rem 1rem;
  }

  .brand {
    flex: none;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.68rem;
    letter-spacing: 0.2em;
    color: var(--muted);
    padding-right: 1rem;
    border-right: 1px solid var(--line);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent);
  }

  .views {
    display: flex;
    gap: 0.4rem;
  }

  .views .ctl {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    /* Never let a card shrink below its label: squeezed, the hint wraps onto a
       third line and the whole bar grows taller instead of wider. */
    flex: none;
    white-space: nowrap;
  }

  .hint {
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  @media (max-width: 720px) {
    .brand {
      display: none;
    }
    .hint {
      display: none;
    }
  }
</style>
