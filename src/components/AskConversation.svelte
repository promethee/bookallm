<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';
  import ChapterOffer from './ChapterOffer.svelte';

  const controller = getController();
  const turns = $derived(controller.turns);
  const busy = $derived(controller.askBusy);

  let question = $state('');

  /** The nothing-found turn a "which chapter?" turn belongs to, if it can still be retried. */
  function openTarget(id: string | undefined) {
    const target = turns.find((turn) => turn.id === id);
    return target && controller.canRecover(target) ? target : undefined;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const asked = question;
    if (asked.trim() === '') return;
    question = '';
    void controller.askQuestion(asked);
  }
</script>

<div class="space-y-4">
  <form class="flex gap-2" onsubmit={submit}>
    <label class="sr-only" for="ask-question">{t('ask.questionLabel')}</label>
    <input
      id="ask-question"
      type="text"
      bind:value={question}
      disabled={busy}
      placeholder={t('ask.placeholder')}
      class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
    />
    {#if busy}
      <Button variant="secondary" onclick={() => controller.stopAnswer()}
        >{t('ask.stop')}</Button
      >
    {:else}
      <Button type="submit">{t('ask.submit')}</Button>
    {/if}
  </form>

  {#each turns as turn (turn.id)}
    <div
      class="space-y-2 rounded-md border border-slate-300 bg-white p-4"
      aria-busy={turn.state === 'waiting' ||
        turn.state === 'streaming' ||
        undefined}
    >
      {#if turn.kind === 'chapter-retry' && turn.chapter}
        <p class="font-medium text-slate-900">
          {t('recovery.lookingIn', {
            chapter: turn.chapter.title,
            question: turn.question,
          })}
        </p>
      {:else}
        <p class="font-medium text-slate-900">{turn.question}</p>
      {/if}

      {#if turn.kind === 'hint-unclear'}
        <p class="text-slate-800">{t('recovery.unclear')}</p>
        {#if openTarget(turn.retryOf)}
          <ChapterOffer turnId={turn.retryOf ?? ''} />
        {/if}
      {/if}

      {#if turn.state === 'waiting'}
        <p class="text-sm text-slate-700">{t('ask.waiting')}</p>
      {:else if turn.text}
        <p class="whitespace-pre-wrap text-slate-800">{turn.text}</p>
      {/if}

      {#if turn.state === 'failed'}
        <div
          role="alert"
          class="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {#if turn.error?.code === 'unreachable'}
            <p>{t('ask.error.unreachable')}</p>
          {:else if turn.error?.code === 'model-not-found'}
            <p>{t('ask.error.modelNotFound')}</p>
          {:else}
            <p>{t('ask.error.other')}</p>
            {#if turn.error?.detail}
              <details>
                <summary class="cursor-pointer">{t('common.details')}</summary>
                <pre class="mt-1 text-xs whitespace-pre-wrap">{turn.error
                    .detail}</pre>
              </details>
            {/if}
          {/if}
        </div>
        <Button onclick={() => void controller.retryTurn(turn.id)}
          >{t('common.tryAgain')}</Button
        >
      {/if}

      {#if controller.canRecover(turn)}
        <!-- A nothing-found reply already asks where to look; an uncited answer does not. -->
        {#if turn.verdict === 'relevant'}
          <p class="text-slate-800">{t('recovery.uncited')}</p>
        {/if}
        <ChapterOffer turnId={turn.id} />
      {/if}

      {#if turn.handedOver !== undefined && turn.chapter}
        <p class="text-slate-800">{t('recovery.handOver')}</p>
        <details open class="rounded-md border border-slate-200 bg-slate-50">
          <summary
            class="cursor-pointer px-3 py-2 text-sm font-medium text-slate-900"
            >{turn.chapter.title}</summary
          >
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            tabindex="0"
            role="region"
            aria-label={turn.chapter.title}
            class="max-h-96 overflow-y-auto border-t border-slate-200 px-3 py-2 text-sm whitespace-pre-wrap text-slate-800"
          >
            {turn.handedOver}
          </div>
        </details>
      {/if}

      {#if turn.citations.length > 0}
        <div
          class="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
        >
          <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">
            {t('ask.sources')}
          </p>
          <ol class="space-y-2">
            {#each turn.citations as citation (citation.offset + ':' + citation.passageIndex)}
              <li>
                <p class="text-xs text-slate-500">
                  [{citation.passageIndex}] {citation.locator.chapterTitle}
                </p>
                <blockquote
                  class="mt-1 border-l-2 border-slate-300 pl-2 text-sm text-slate-700"
                >
                  {citation.text}
                </blockquote>
              </li>
            {/each}
          </ol>
        </div>
      {/if}
    </div>
  {/each}
</div>
