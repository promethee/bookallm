<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import CheckingScreen from './components/CheckingScreen.svelte';
  import GetOllamaScreen from './components/GetOllamaScreen.svelte';
  import ImportScreen from './components/ImportScreen.svelte';
  import IndexingScreen from './components/IndexingScreen.svelte';
  import LandingScreen from './components/LandingScreen.svelte';
  import LanguageScreen from './components/LanguageScreen.svelte';
  import LanguageSelect from './components/LanguageSelect.svelte';
  import LiveRegion from './components/LiveRegion.svelte';
  import ModelsScreen from './components/ModelsScreen.svelte';
  import UpdateOllamaScreen from './components/UpdateOllamaScreen.svelte';
  import { t } from './lib/i18n';
  import { setController } from './lib/onboarding/context';
  import { OnboardingController } from './lib/onboarding/controller.svelte';
  import type { Services } from './lib/onboarding/services';

  let { services }: { services: Services } = $props();

  const controller = new OnboardingController(untrack(() => services));
  setController(controller);

  onMount(() => {
    void controller.start();
    return () => controller.destroy();
  });
</script>

<div class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
  <header class="flex items-center justify-between">
    <span class="text-lg font-bold text-indigo-700">{t('app.name')}</span>
    <LanguageSelect />
  </header>

  {#if controller.problem}
    <p
      role="alert"
      class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {controller.problem === 'full'
        ? t('storage.full')
        : t('storage.unavailable')}
    </p>
  {/if}

  <main class="flex-1">
    {#if controller.screen === 'language'}
      <LanguageScreen />
    {:else if controller.screen === 'checking'}
      <CheckingScreen />
    {:else if controller.screen === 'get-ollama'}
      <GetOllamaScreen />
    {:else if controller.screen === 'update-ollama'}
      <UpdateOllamaScreen />
    {:else if controller.screen === 'pull-models'}
      <ModelsScreen />
    {:else if controller.screen === 'index-book'}
      <IndexingScreen />
    {:else if controller.screen === 'import-book'}
      <ImportScreen />
    {:else}
      <LandingScreen />
    {/if}
  </main>

  <LiveRegion />
</div>
