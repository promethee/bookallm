<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';

  const controller = getController();
  const deleting = $derived(controller.deleteState === 'deleting');
  const failed = $derived(controller.deleteState === 'failed');

  // Whether the confirmation is open is only this card's concern, not the controller's.
  let confirming = $state(false);
  let action = $state<HTMLButtonElement>();
  let cancel = $state<HTMLButtonElement>();

  async function open(): Promise<void> {
    confirming = true;
    await tick();
    // The safe choice is the one a stray Enter hits.
    cancel?.focus();
  }

  async function close(): Promise<void> {
    confirming = false;
    await tick();
    action?.focus();
  }
</script>

{#if confirming}
  <div
    class="mt-3 space-y-3 rounded-md border border-red-200 bg-red-50 p-3"
    role="group"
    aria-labelledby="delete-confirm-text"
  >
    <p id="delete-confirm-text" class="text-sm text-red-950">
      {t('delete.confirm')}
    </p>
    {#if failed}
      <p role="alert" class="text-sm font-medium text-red-900">
        {t('delete.failed')}
      </p>
    {/if}
    <div class="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        bind:ref={cancel}
        disabled={deleting}
        onclick={() => void close()}>{t('delete.cancel')}</Button
      >
      <Button
        variant="danger"
        disabled={deleting}
        busy={deleting}
        onclick={() => void controller.deleteActiveBook()}
        >{t('delete.yes')}</Button
      >
    </div>
  </div>
{:else}
  <div class="mt-3">
    <Button variant="secondary" bind:ref={action} onclick={() => void open()}
      >{t('delete.action')}</Button
    >
  </div>
{/if}
