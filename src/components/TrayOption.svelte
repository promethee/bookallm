<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';

  const controller = getController();
  const on = $derived(controller.settings.closeToTray ?? true);
</script>

<label class="flex items-center gap-2 text-sm text-slate-700">
  <input
    type="checkbox"
    checked={on}
    onchange={(event) =>
      controller.setCloseToTray((event.target as HTMLInputElement).checked)}
    class="h-4 w-4 rounded border-slate-300"
  />
  {t('tray.keepRunning')}
</label>
