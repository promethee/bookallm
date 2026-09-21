<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    type = 'button',
    disabled = false,
    busy = false,
    onclick,
    children,
  }: {
    variant?: 'primary' | 'secondary';
    type?: 'button' | 'submit';
    disabled?: boolean;
    /** Shown as busy to assistive technology while work is running. */
    busy?: boolean;
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

<button
  {type}
  {disabled}
  aria-busy={busy || undefined}
  {onclick}
  class="rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 {variant ===
  'primary'
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}"
>
  {@render children()}
</button>
