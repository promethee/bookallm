<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import {
    IDLE_UNLOAD_CHOICES,
    IDLE_UNLOAD_DEFAULT,
    type IdleUnload,
  } from '../lib/ollama';

  const controller = getController();
  const current = $derived(
    controller.settings.idleUnload ?? IDLE_UNLOAD_DEFAULT,
  );

  const label = (choice: IdleUnload): string =>
    choice === 'never' ? t('idle.never') : t('idle.minutes', { count: choice });

  function change(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const choice = IDLE_UNLOAD_CHOICES.find((c) => String(c) === value);
    if (choice !== undefined) controller.setIdleUnload(choice);
  }
</script>

<div class="space-y-1">
  <div class="flex flex-wrap items-center gap-2">
    <label for="idle-unload" class="text-sm text-slate-700"
      >{t('idle.label')}</label
    >
    <select
      id="idle-unload"
      value={String(current)}
      onchange={change}
      aria-describedby="idle-unload-hint"
      class="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
    >
      {#each IDLE_UNLOAD_CHOICES as choice (choice)}
        <option value={String(choice)}>{label(choice)}</option>
      {/each}
    </select>
  </div>
  <p id="idle-unload-hint" class="text-xs text-slate-600">
    {t('idle.hint')}
  </p>
</div>
