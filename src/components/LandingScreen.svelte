<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import AskConversation from './AskConversation.svelte';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
  const book = $derived(controller.activeBook);
</script>

<section class="space-y-4">
  <Heading>{t('app.name')}</Heading>

  <p class="rounded-md bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
    {t('landing.mode')}
  </p>

  {#if book}
    <div class="rounded-md border border-slate-300 bg-white p-4">
      <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {t('landing.activeBook')}
      </p>
      <p class="mt-1 text-lg font-semibold text-slate-900">
        {book.title || book.sourceFilename}
      </p>
      {#if book.authors.length > 0}
        <p class="text-sm text-slate-700">
          {t('landing.byAuthors', { authors: book.authors.join(', ') })}
        </p>
      {/if}
      <p class="text-sm text-slate-700">
        {t('common.chapters', { count: book.chapterCount })}
      </p>
    </div>
    <Button variant="secondary" onclick={() => controller.requestImport()}>
      {t('landing.import')}
    </Button>
    <AskConversation />
  {:else}
    <p class="text-slate-700">{t('landing.noBook')}</p>
    <Button onclick={() => controller.requestImport()}>
      {t('landing.import')}
    </Button>
  {/if}
</section>
