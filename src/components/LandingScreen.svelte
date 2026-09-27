<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import type { Mode } from '../lib/onboarding/controller.svelte';
  import AskConversation from './AskConversation.svelte';
  import Button from './Button.svelte';
  import DeleteBook from './DeleteBook.svelte';
  import Heading from './Heading.svelte';
  import IdleUnload from './IdleUnload.svelte';
  import TrayOption from './TrayOption.svelte';
  import VerifySession from './VerifySession.svelte';

  const controller = getController();
  const book = $derived(controller.activeBook);
  // Tabs only make sense once there is a book to ask about or verify.
  const verifying = $derived(
    book !== undefined && controller.mode === 'verify',
  );

  // After a deletion the focused control is gone: focus the line naming the new book.
  let notice = $state<HTMLParagraphElement>();
  $effect(() => {
    if (controller.bookNotice) notice?.focus();
  });

  const modes: Mode[] = ['ask', 'verify'];
  const tabs: Record<Mode, HTMLButtonElement | undefined> = $state({
    ask: undefined,
    verify: undefined,
  });

  /** Left/Right move between the tabs and select at once (WAI-ARIA tabs pattern). */
  function onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = modes.indexOf(controller.mode);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = modes[(index + step + modes.length) % modes.length];
    controller.setMode(next);
    tabs[next]?.focus();
  }
</script>

<section class="space-y-4">
  <Heading>{t('app.name')}</Heading>

  <p
    class="rounded-md px-3 py-2 text-sm {verifying
      ? 'border-l-4 border-amber-500 bg-amber-100 font-medium text-amber-950'
      : 'bg-indigo-50 text-indigo-900'}"
  >
    {verifying ? t('landing.modeVerify') : t('landing.mode')}
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
      {#if controller.bookNotice}
        <p
          bind:this={notice}
          tabindex="-1"
          class="mt-2 text-sm font-medium text-indigo-900 outline-none"
        >
          {t('landing.nowShowing', { title: controller.bookNotice.title })}
        </p>
      {/if}
      <!-- A fresh control per book: a confirmation never carries over to the next one. -->
      {#key book.hash}
        <DeleteBook />
      {/key}
    </div>
    <Button variant="secondary" onclick={() => controller.requestImport()}>
      {t('landing.import')}
    </Button>
    <IdleUnload />
    <TrayOption />

    <div
      role="tablist"
      aria-label={t('mode.tabsLabel')}
      class="flex gap-1 border-b border-slate-300"
    >
      {#each modes as mode (mode)}
        {@const selected = controller.mode === mode}
        <button
          bind:this={tabs[mode]}
          type="button"
          role="tab"
          id="tab-{mode}"
          aria-selected={selected}
          aria-controls={selected ? `panel-${mode}` : undefined}
          tabindex={selected ? 0 : -1}
          onclick={() => controller.setMode(mode)}
          onkeydown={onTabKey}
          class="-mb-px rounded-t-md border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 {selected
            ? mode === 'verify'
              ? 'border-amber-400 border-b-amber-50 bg-amber-50 text-amber-900'
              : 'border-slate-300 border-b-white bg-white text-indigo-800'
            : 'border-transparent text-slate-600 hover:text-slate-900'}"
        >
          {t(`mode.${mode}`)}
        </button>
      {/each}
    </div>

    <div
      role="tabpanel"
      id="panel-{controller.mode}"
      aria-labelledby="tab-{controller.mode}"
    >
      {#if controller.mode === 'verify'}
        <VerifySession />
      {:else}
        <AskConversation />
      {/if}
    </div>
  {:else}
    <p class="text-slate-700">{t('landing.noBook')}</p>
    <Button onclick={() => controller.requestImport()}>
      {t('landing.import')}
    </Button>
  {/if}
</section>
