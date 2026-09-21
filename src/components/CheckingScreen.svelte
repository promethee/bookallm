<script lang="ts">
  import { t } from '../lib/i18n';
  import Heading from './Heading.svelte';
</script>

<section class="space-y-3" aria-busy="true">
  <Heading>{t('checking.title')}</Heading>
  <p class="text-slate-700">{t('checking.body')}</p>
</section>
