<script lang="ts">
  import { formatMinutes, formatProgress, getLanguage, t } from '../lib/i18n';
  import { roundRemaining } from '../lib/indexing';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
  const run = $derived(controller.indexState);
  const book = $derived(controller.activeBook);
  const title = $derived(book?.title || book?.sourceFilename || '');
  const progress = $derived(run.kind === 'running' ? run.progress : undefined);
  const remaining = $derived(
    run.kind === 'running' && run.remainingMs !== undefined
      ? roundRemaining(run.remainingMs)
      : undefined,
  );
</script>

<section class="space-y-4" aria-busy={run.kind !== 'failed' || undefined}>
  <Heading>{t('indexing.title')}</Heading>

  <p class="text-slate-700">{t('indexing.forBook', { title })}</p>

  {#if run.kind === 'failed'}
    <div
      role="alert"
      class="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900"
    >
      {#if run.error.code === 'unreachable'}
        <p>{t('indexing.error.unreachable')}</p>
      {:else if run.error.code === 'model-not-found'}
        <p>
          {t('indexing.error.notFound', {
            name: controller.settings.embeddingModel,
          })}
        </p>
      {:else if run.error.code === 'storage-full'}
        <p>{t('indexing.error.diskSpace')}</p>
      {:else}
        <p>{t('indexing.error.other')}</p>
        {#if run.error.detail}
          <details>
            <summary class="cursor-pointer">{t('common.details')}</summary>
            <pre class="mt-1 text-xs whitespace-pre-wrap">{run.error
                .detail}</pre>
          </details>
        {/if}
      {/if}
    </div>
    <Button onclick={() => void controller.retryIndexing()}
      >{t('common.tryAgain')}</Button
    >
  {:else}
    {#if run.kind === 'running' && run.rebuild}
      <p class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {t('indexing.rebuild')}
      </p>
    {:else if run.kind === 'running' && run.resumed}
      <p class="text-sm text-slate-700">{t('indexing.resumed')}</p>
    {/if}

    <div class="flex items-center justify-between gap-3 text-slate-900">
      <p class="flex items-center gap-2 font-medium">
        {#if run.kind === 'running'}
          <!-- Shows the work is going on between updates; still for reduced motion. -->
          <span
            aria-hidden="true"
            class="inline-block size-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700 motion-reduce:animate-none"
          ></span>
        {/if}
        {progress
          ? t('indexing.chapter', {
              current: progress.chapterPosition,
              total: progress.chapterTotal,
            })
          : t('indexing.starting')}
      </p>
      <p class="font-medium tabular-nums">
        {formatProgress(
          progress && progress.chunksTotal > 0
            ? progress.chunksDone / progress.chunksTotal
            : 0,
          getLanguage(),
        )}
      </p>
    </div>
    <progress
      class="w-full"
      aria-label={t('indexing.progressLabel')}
      value={progress?.chunksDone ?? 0}
      max={progress?.chunksTotal || 1}
    ></progress>
    {#if run.kind === 'running'}
      <p class="text-sm font-medium text-slate-900">
        {#if !remaining}
          {t('indexing.estimating')}
        {:else if remaining.kind === 'under-a-minute'}
          {t('indexing.remainingSoon')}
        {:else}
          {t('indexing.remaining', {
            time: formatMinutes(remaining.minutes, getLanguage()),
          })}
        {/if}
      </p>
    {/if}
    <p class="text-sm text-slate-700">{t('indexing.intro')}</p>
  {/if}
</section>
