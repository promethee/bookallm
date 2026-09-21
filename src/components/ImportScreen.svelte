<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import BookCard from './BookCard.svelte';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
  const current = $derived(controller.importState);

  let input = $state<HTMLInputElement>();
  let dragging = $state(false);

  function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const files = Array.from(event.currentTarget.files ?? []);
    // Reset so choosing the same file again still fires a change.
    event.currentTarget.value = '';
    void controller.importFiles(files);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    void controller.importFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  /** Leaves the import screen: postpones the first import, or goes back to the landing screen. */
  function leave() {
    if (controller.books.length === 0) controller.postponeImport();
    else controller.finishImport();
  }
</script>

<section class="space-y-4" aria-busy={current.kind === 'working' || undefined}>
  {#if current.kind === 'imported'}
    <Heading
      >{current.existing
        ? t('import.done.existingTitle')
        : t('import.done.title')}</Heading
    >
    <p class="text-slate-700">
      {current.existing ? t('import.done.existingBody') : t('import.done.body')}
    </p>
    <BookCard
      title={current.book.title || current.book.filename || ''}
      authors={current.book.authors}
      chapters={current.book.chapters}
    />
    {#if controller.skippedFiles > 0}
      <p class="text-sm text-slate-700">
        {t('import.skipped', { count: controller.skippedFiles })}
      </p>
    {/if}
    <Button onclick={() => controller.finishImport()}
      >{t('common.continue')}</Button
    >
  {:else if current.kind === 'working'}
    <Heading>{t('import.working')}</Heading>
    <p class="text-slate-700">
      {t('import.workingFile', { filename: current.filename })}
    </p>
  {:else if current.kind === 'error'}
    <Heading>{t('import.error.title')}</Heading>
    <p role="alert" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
      {#if current.code === 'not-an-epub'}
        {t('import.error.notEpub')}
      {:else if current.code === 'no-text-content'}
        {t('import.error.noText')}
      {:else if current.code === 'drm-locked'}
        {t('import.error.drm')}
      {:else}
        {t('import.error.malformed')}
      {/if}
    </p>
    <Button onclick={() => controller.tryAnotherFile()}
      >{t('import.tryAnother')}</Button
    >
  {:else if current.kind === 'duplicate'}
    <Heading>{t('import.duplicate.title')}</Heading>
    <p class="text-slate-700">{t('import.duplicate.body')}</p>
    <div class="grid gap-3 sm:grid-cols-2">
      <BookCard
        label={t('import.duplicate.new')}
        title={current.book.title || current.book.sourceFilename || ''}
        authors={current.book.authors}
        chapters={current.book.chapters.length}
      />
      {#each current.candidates as candidate (candidate.hash)}
        <BookCard
          label={t('import.duplicate.existing')}
          title={candidate.title || candidate.sourceFilename || ''}
          authors={candidate.authors}
          chapters={candidate.chapterCount}
        />
      {/each}
    </div>
    <div class="flex flex-wrap gap-3">
      <Button onclick={() => void controller.answerDuplicate('add')}
        >{t('import.duplicate.add')}</Button
      >
      <Button
        variant="secondary"
        onclick={() => void controller.answerDuplicate('cancel')}
      >
        {t('common.cancel')}
      </Button>
    </div>
  {:else if current.kind === 'save-failed'}
    <Heading>{t('import.saveFailed.title')}</Heading>
    <p role="alert" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
      {current.reason === 'full'
        ? t('import.saveFailed.full')
        : t('import.saveFailed.other')}
    </p>
    <Button onclick={() => controller.tryAnotherFile()}
      >{t('import.tryAnother')}</Button
    >
  {:else}
    <Heading>{t('import.title')}</Heading>
    <p class="text-slate-700">{t('import.body')}</p>

    <input
      bind:this={input}
      type="file"
      accept=".epub,application/epub+zip"
      hidden
      onchange={choose}
    />
    <button
      type="button"
      class="w-full rounded-md border-2 border-dashed px-4 py-10 text-center text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 {dragging
        ? 'border-indigo-600 bg-indigo-50'
        : 'border-slate-300 bg-white hover:bg-slate-50'}"
      onclick={() => input?.click()}
      ondragover={(event) => {
        event.preventDefault();
        dragging = true;
      }}
      ondragleave={() => (dragging = false)}
      ondrop={drop}
    >
      {t('import.drop')}
    </button>

    {#if controller.skippedFiles > 0}
      <p class="text-sm text-slate-700">
        {t('import.skipped', { count: controller.skippedFiles })}
      </p>
    {/if}

    <Button variant="secondary" onclick={leave}>{t('common.notNow')}</Button>
  {/if}
</section>
