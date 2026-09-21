<script lang="ts">
  import { getLanguage, LANGUAGES, t, type Language } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';
  import Heading from './Heading.svelte';

  const controller = getController();
</script>

<section class="space-y-4">
  <Heading>{t('languageScreen.title')}</Heading>
  <p class="text-slate-700">{t('languageScreen.body')}</p>

  <fieldset class="space-y-2">
    <legend class="sr-only">{t('language.label')}</legend>
    {#each LANGUAGES as code (code)}
      <label
        class="flex cursor-pointer items-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-3 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50"
      >
        <input
          type="radio"
          name="language"
          value={code}
          checked={getLanguage() === code}
          onchange={() => controller.changeLanguage(code as Language)}
        />
        <span class="text-base">{t(`language.name.${code}`)}</span>
      </label>
    {/each}
  </fieldset>

  <Button onclick={() => void controller.confirmLanguage()}
    >{t('common.continue')}</Button
  >
</section>
