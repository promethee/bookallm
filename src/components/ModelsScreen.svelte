<script lang="ts">
  import { formatBytes, formatPercent, getLanguage, t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
  const readiness = $derived(controller.readiness);
  const plan = $derived(
    readiness?.step === 'pull-models' ? readiness.plan : undefined,
  );
  const pull = $derived(controller.pull);
  const language = $derived(getLanguage());

  const someUnknown = $derived(
    plan?.items.some((item) => item.approxBytes === undefined) ?? false,
  );
  const failedNotFound = $derived(
    pull.status === 'failed' && pull.error.code === 'model-not-found',
  );
  /** The progress to show while downloading, or what was reached before a cancel. */
  const progress = $derived(
    pull.status === 'running' || pull.status === 'cancelled'
      ? pull.progress
      : undefined,
  );
  /** Every byte has arrived and Ollama is checking or finishing: nothing more to download. */
  const checking = $derived(
    progress?.phase === 'verifying' ||
      progress?.phase === 'finishing' ||
      progress?.phase === 'done',
  );
</script>

<section class="space-y-4">
  <Heading>{t('models.title')}</Heading>

  {#if pull.status === 'running' || pull.status === 'cancelled'}
    {#if progress}
      <p class="font-medium text-slate-900">
        {t('models.downloading', { name: progress.model })}
      </p>
      <p role="status" class="text-slate-700">
        {t(`models.phase.${progress.phase}`)}
      </p>
      {#if !checking && progress.totalBytes > 0}
        <progress
          class="w-full"
          aria-label={t('models.progressLabel')}
          value={progress.completedBytes}
          max={progress.totalBytes}
        ></progress>
      {:else}
        <!-- No value attribute at all: the bar is indeterminate and moves, instead of
             sitting at 100% while Ollama checks the download. -->
        <progress class="w-full" aria-label={t('models.progressLabel')}
        ></progress>
      {/if}
      {#if progress.totalBytes > 0 && !checking}
        <p class="text-sm text-slate-700">
          {t('models.amount', {
            done: formatBytes(progress.completedBytes, language),
            total: formatBytes(progress.totalBytes, language),
          })}
          {#if progress.fraction !== undefined}({formatPercent(
              progress.fraction,
              language,
            )}){/if}
        </p>
      {/if}
    {:else}
      <p class="text-slate-700">{t('models.phase.preparing')}</p>
    {/if}

    {#if pull.status === 'running'}
      <!-- Once every byte has arrived there is nothing left to cancel. -->
      {#if !checking}
        <Button variant="secondary" onclick={() => controller.cancelDownload()}
          >{t('common.cancel')}</Button
        >
      {/if}
    {:else}
      <p class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {t('models.cancelled')}
      </p>
      <Button onclick={() => void controller.startDownload()}
        >{t('common.continue')}</Button
      >
    {/if}
  {:else}
    <p class="text-slate-700">{t('models.intro')}</p>

    {#if pull.status === 'failed'}
      <div
        role="alert"
        class="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900"
      >
        {#if pull.error.code === 'unreachable'}
          <p>{t('models.error.unreachable')}</p>
        {:else if pull.error.code === 'model-not-found'}
          <p>{t('models.error.notFound', { name: pull.model ?? '' })}</p>
        {:else if pull.error.code === 'insufficient-disk-space'}
          <p>{t('models.error.diskSpace')}</p>
        {:else}
          <p>{t('models.error.other')}</p>
          {#if pull.error.detail}
            <details>
              <summary class="cursor-pointer">{t('common.details')}</summary>
              <pre class="mt-1 text-xs whitespace-pre-wrap">{pull.error
                  .detail}</pre>
            </details>
          {/if}
        {/if}
      </div>
    {/if}

    {#if plan}
      <div class="space-y-2 rounded-md border border-slate-300 bg-white p-4">
        <h2 class="text-sm font-semibold text-slate-900">
          {t('models.toDownload')}
        </h2>
        <ul class="space-y-1 text-slate-800">
          {#each plan.items as item (item.role)}
            <li>
              <span class="text-xs text-slate-500"
                >{t(`models.role.${item.role}`)}</span
              >
              <br />
              {#if item.approxBytes === undefined}
                {t('models.item.unknownSize', { name: item.model })}
              {:else}
                {t('models.item.size', {
                  name: item.model,
                  size: formatBytes(item.approxBytes, language),
                })}
              {/if}
            </li>
          {/each}
        </ul>
        {#if plan.totalKnownBytes > 0}
          <p class="text-sm font-medium text-slate-900">
            {someUnknown
              ? t('models.totalPartial', {
                  size: formatBytes(plan.totalKnownBytes, language),
                })
              : t('models.total', {
                  size: formatBytes(plan.totalKnownBytes, language),
                })}
          </p>
        {/if}
      </div>
    {/if}

    <details
      class="rounded-md border border-slate-300 bg-white p-3"
      open={failedNotFound}
    >
      <summary class="cursor-pointer text-sm font-medium text-slate-800"
        >{t('models.different')}</summary
      >
      <div class="mt-3 space-y-3">
        <label class="block text-sm text-slate-800">
          <span>{t('models.role.chat')}</span>
          <input
            type="text"
            class="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
            value={controller.modelDraft.chat}
            onchange={(event) =>
              void controller.editModels({
                ...controller.modelDraft,
                chat: event.currentTarget.value,
              })}
          />
        </label>
        <label class="block text-sm text-slate-800">
          <span>{t('models.role.embedding')}</span>
          <input
            type="text"
            class="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
            value={controller.modelDraft.embedding}
            onchange={(event) =>
              void controller.editModels({
                ...controller.modelDraft,
                embedding: event.currentTarget.value,
              })}
          />
        </label>
        <p class="text-xs text-slate-600">{t('models.editHint')}</p>
      </div>
    </details>

    {#if pull.status === 'failed'}
      <Button onclick={() => void controller.retryDownload()}
        >{t('common.tryAgain')}</Button
      >
    {:else}
      <Button onclick={() => void controller.startDownload()}
        >{t('models.download')}</Button
      >
    {/if}
  {/if}
</section>
