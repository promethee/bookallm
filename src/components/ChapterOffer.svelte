<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';

  let {
    turnId,
  }: {
    /** The nothing-found turn whose question a chosen chapter retries. */
    turnId: string;
  } = $props();

  const controller = getController();
  const choices = $derived(controller.chapterChoices);
  const busy = $derived(controller.askBusy);

  // Starts on the first chapter; the reader picks another from the list.
  let selected = $state<number | undefined>(undefined);
  const chosen = $derived(selected ?? choices[0]?.number);
  // Unique per offer: a "which chapter?" turn offers the same question's chapters again.
  const uid = $props.id();
  const id = `chapter-offer-${uid}`;

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (chosen === undefined) return;
    void controller.retryInChapter(turnId, chosen);
  }
</script>

{#if choices.length > 0}
  <form class="space-y-2" onsubmit={submit}>
    <p class="text-sm text-slate-700">{t('recovery.offerLabel')}</p>
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" for={id}>{t('recovery.chapterLabel')}</label>
      <select
        {id}
        value={chosen}
        onchange={(event) =>
          (selected = Number((event.target as HTMLSelectElement).value))}
        disabled={busy}
        class="max-w-full min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
      >
        {#each choices as choice (choice.number)}
          <option value={choice.number}>{choice.title}</option>
        {/each}
      </select>
      <Button type="submit" variant="secondary" disabled={busy}
        >{t('recovery.lookHere')}</Button
      >
    </div>
  </form>
{/if}
