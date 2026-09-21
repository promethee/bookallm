<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let heading = $state<HTMLHeadingElement>();

  // Every screen mounts when it appears, so this moves keyboard focus to the new
  // screen's heading whenever the screen changes.
  onMount(() => heading?.focus());
</script>

<h1
  bind:this={heading}
  tabindex="-1"
  class="text-2xl font-semibold text-slate-900 outline-none"
>
  {@render children()}
</h1>
