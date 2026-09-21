<script lang="ts">
  import { t } from '../lib/i18n';
  import AdvancedAddress from './AdvancedAddress.svelte';
  import Heading from './Heading.svelte';
  import InstallSteps from './InstallSteps.svelte';
</script>

<section class="space-y-4">
  <Heading>{t('ollama.get.title')}</Heading>
  <p class="text-slate-700">{t('ollama.get.intro')}</p>
  <p class="text-slate-700">{t('ollama.get.mayBeInstalled')}</p>
  <InstallSteps />
  <AdvancedAddress />
</section>
