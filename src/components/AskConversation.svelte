<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';

  const controller = getController();
  const turns = $derived(controller.turns);
  const busy = $derived(controller.askBusy);

  let question = $state('');

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
      <p class="font-medium text-slate-900">{turn.question}</p>

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
