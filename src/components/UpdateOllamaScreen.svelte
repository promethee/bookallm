<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import AdvancedAddress from './AdvancedAddress.svelte';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
  const readiness = $derived(controller.readiness);
  let openFailed = $state(false);

  async function openPage() {
    openFailed = !(await controller.openDownloadPage());
  }
</script>

<section class="space-y-4">
  <Heading>{t('ollama.update.title')}</Heading>
  {#if readiness?.step === 'update-ollama'}
    <p class="text-slate-700">
      {t('ollama.update.body', {
        version: readiness.version,
        minimum: readiness.minimumVersion,
      })}
    </p>
  {/if}
  <p class="text-slate-700">{t('ollama.update.step')}</p>

  <div class="flex flex-wrap gap-3">
    <Button onclick={() => void openPage()}>{t('ollama.downloadButton')}</Button
    >
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
    {t('ollama.downloadAddress', { url: controller.guidance.downloadUrl })}
  </p>

  <AdvancedAddress />
</section>
