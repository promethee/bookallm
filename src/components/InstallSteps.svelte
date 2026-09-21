<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';

  const controller = getController();
  const guidance = $derived(controller.guidance);
  let openFailed = $state(false);

  async function openPage() {
    openFailed = !(await controller.openDownloadPage());
  }
</script>

<ol class="list-decimal space-y-2 pl-6 text-slate-800">
  {#each guidance.steps as step (step)}
    <li>{t(`ollama.step.${step}`)}</li>
  {/each}
</ol>

<div class="flex flex-wrap gap-3">
  <Button onclick={() => void openPage()}>{t('ollama.downloadButton')}</Button>
  <Button
    variant="secondary"
    busy={controller.checking}
    onclick={() => void controller.checkAgain()}
  >
    {t('common.checkAgain')}
  </Button>
</div>

{#if openFailed}
  <p
    role="alert"
    class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
  >
    {t('ollama.openFailed')}
  </p>
{/if}

<p class="text-sm break-all text-slate-600">
  {t('ollama.downloadAddress', { url: guidance.downloadUrl })}
</p>
