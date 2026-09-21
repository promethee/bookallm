<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';

  const controller = getController();
  const message = $derived(
    controller.announcement
      ? t(controller.announcement.key, controller.announcement.params)
      : '',
  );
</script>

<!-- Read out by screen readers when it changes; not visible. -->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
  {message}
</div>
