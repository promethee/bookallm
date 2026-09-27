<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'primary',
    type = 'button',
    disabled = false,
    busy = false,
    onclick,
    ref = $bindable(),
    children,
  }: {
    /**
     * `verify`: Verify mode's own color, so its actions never look like Ask mode's.
     * `danger`: an action that removes something for good.
     */
    variant?: 'primary' | 'secondary' | 'verify' | 'danger';
    type?: 'button' | 'submit';
    disabled?: boolean;
    /** Shown as busy to assistive technology while work is running. */
    busy?: boolean;
    onclick?: () => void;
    /** The `<button>` itself, for a caller that needs to move focus to it. */
    ref?: HTMLButtonElement;
    children: Snippet;
  } = $props();
</script>

<button
  bind:this={ref}
  {type}
  {disabled}
  aria-busy={busy || undefined}
  {onclick}
  class="rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 {variant ===
  'primary'
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : variant === 'verify'
      ? 'bg-amber-700 text-white hover:bg-amber-800'
      : variant === 'danger'
        ? 'bg-red-700 text-white hover:bg-red-800'
        : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}"
>
  {@render children()}
</button>
