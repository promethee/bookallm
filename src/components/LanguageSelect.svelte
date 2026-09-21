<script lang="ts">
  import { getLanguage, LANGUAGES, t, type Language } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';

  const controller = getController();
</script>

<label class="flex items-center gap-2 text-sm text-slate-700">
  <span>{t('language.label')}</span>
  <select
    class="rounded-md border border-slate-300 bg-white px-2 py-1"
    value={getLanguage()}
    onchange={(event) =>
      controller.changeLanguage(event.currentTarget.value as Language)}
  >
    {#each LANGUAGES as code (code)}
      <option value={code}>{t(`language.name.${code}`)}</option>
    {/each}
  </select>
</label>
