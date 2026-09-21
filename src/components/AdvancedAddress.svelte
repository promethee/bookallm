<script lang="ts">
  import { untrack } from 'svelte';
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';

  const controller = getController();
  let address = $state(untrack(() => controller.settings.ollamaUrl));
</script>

<details class="rounded-md border border-slate-300 bg-white p-3">
  <summary class="cursor-pointer text-sm font-medium text-slate-800"
    >{t('ollama.advanced')}</summary
  >
  <form
    class="mt-3 space-y-2"
    onsubmit={(event) => {
      event.preventDefault();
      void controller.setOllamaUrl(address);
    }}
  >
    <label class="block text-sm text-slate-800">
      <span>{t('ollama.address.label')}</span>
      <input
        type="text"
        class="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1"
        bind:value={address}
        aria-invalid={controller.addressError || undefined}
        aria-describedby="address-help"
      />
    </label>
    <p id="address-help" class="text-xs text-slate-600">
      {t('ollama.address.help')}
    </p>
    {#if controller.addressError}
      <p role="alert" class="text-sm text-red-700">
        {t('ollama.address.invalid')}
      </p>
    {/if}
    <Button type="submit" variant="secondary">{t('ollama.address.use')}</Button>
  </form>
</details>
