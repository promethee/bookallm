<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
</script>

<section class="space-y-4">
  <Heading>{t('hardware.title')}</Heading>
  <p class="text-slate-700">{t('hardware.body')}</p>

  <Button onclick={() => controller.acknowledgeHardwareWarning()}>
    {t('hardware.continue')}
  </Button>
</section>
