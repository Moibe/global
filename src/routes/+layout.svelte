<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import ViewNav from '$lib/ui/ViewNav.svelte';

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<ViewNav />

{@render children()}
