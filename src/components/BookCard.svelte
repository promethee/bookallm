<script lang="ts">
  import { t } from '../lib/i18n';

  let {
    label,
    title,
    authors,
    chapters,
  }: {
    /** A small caption above the title, such as "Already in BookaLLM". */
    label?: string;
    title: string;
    authors: readonly string[];
    chapters: number;
  } = $props();
</script>

<div class="rounded-md border border-slate-300 bg-white p-4">
  {#if label}
    <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">
      {label}
    </p>
  {/if}
  <p class="mt-1 text-lg font-semibold text-slate-900">{title}</p>
  {#if authors.length > 0}
    <p class="text-sm text-slate-700">
      {t('landing.byAuthors', { authors: authors.join(', ') })}
    </p>
  {/if}
  <p class="text-sm text-slate-700">
    {t('common.chapters', { count: chapters })}
  </p>
</div>
