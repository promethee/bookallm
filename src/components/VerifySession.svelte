<script lang="ts">
  import { t } from '../lib/i18n';
  import { getController } from '../lib/onboarding/context';
  import Button from './Button.svelte';

  const controller = getController();
  const verify = $derived(controller.verify);
  const tally = $derived(controller.verifyTally);
  const claim = $derived(verify.claim);
  const right = $derived(
    verify.state === 'revealed' && claim && verify.guess === claim.isTrue,
  );
</script>

<div class="space-y-4">
  <p class="text-sm text-slate-700">{t('verify.intro')}</p>

  <p class="text-sm font-medium text-amber-900">
    {t('verify.tally', { correct: tally.correct, judged: tally.judged })}
  </p>

  {#if verify.state === 'idle'}
    <Button variant="verify" onclick={() => void controller.requestClaim()}>
      {t('verify.getClaim')}
    </Button>
  {:else if verify.state === 'generating'}
    <div
      class="space-y-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-4"
      aria-busy="true"
    >
      <p class="text-sm text-amber-900">{t('verify.waiting')}</p>
      <Button variant="secondary" onclick={() => controller.stopClaim()}>
        {t('verify.stop')}
      </Button>
    </div>
  {:else if verify.state === 'failed'}
    <div
      role="alert"
      class="space-y-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900"
    >
      {#if verify.error?.code === 'unreachable'}
        <p>{t('ask.error.unreachable')}</p>
      {:else if verify.error?.code === 'model-not-found'}
        <p>{t('ask.error.modelNotFound')}</p>
      {:else if verify.error?.code === 'unverified'}
        <p>{t('verify.error.unverified')}</p>
      {:else}
        <p>{t('verify.error.other')}</p>
        {#if verify.error?.detail}
          <details>
            <summary class="cursor-pointer">{t('common.details')}</summary>
            <pre class="mt-1 text-xs whitespace-pre-wrap">{verify.error
                .detail}</pre>
          </details>
        {/if}
      {/if}
    </div>
    <Button variant="verify" onclick={() => void controller.retryClaim()}>
      {t('common.tryAgain')}
    </Button>
  {:else if claim}
    <div class="space-y-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-5">
      <p class="text-xs font-medium tracking-wide text-amber-800 uppercase">
        {t('verify.question')}
      </p>
      <p class="text-lg text-slate-900">{claim.claim}</p>

      {#if verify.state === 'ready'}
        <div class="flex gap-2">
          <Button
            variant="secondary"
            onclick={() => controller.judgeClaim(true)}
          >
            {t('verify.true')}
          </Button>
          <Button
            variant="secondary"
            onclick={() => controller.judgeClaim(false)}
          >
            {t('verify.false')}
          </Button>
        </div>
      {:else}
        <div class="space-y-1">
          <p class="font-semibold {right ? 'text-green-800' : 'text-red-800'}">
            {right ? t('verify.right') : t('verify.wrong')}
          </p>
          <p class="text-slate-800">
            {#if claim.isTrue}
              {t('verify.wasTrue')}
            {:else}
              {t('verify.wasFalse', {
                attribute: t(
                  `verify.attribute.${claim.changedAttribute ?? 'cause'}`,
                ),
              })}
            {/if}
          </p>
        </div>
        <div class="space-y-1 rounded-md border border-slate-200 bg-white p-3">
          <p class="text-xs font-medium tracking-wide text-slate-500 uppercase">
            {t('verify.source')}
          </p>
          <p class="text-xs text-slate-500">
            {claim.citation.locator.chapterTitle}
          </p>
          <blockquote
            class="border-l-2 border-slate-300 pl-2 text-sm text-slate-700"
          >
            {claim.citation.text}
          </blockquote>
        </div>
        <Button variant="verify" onclick={() => void controller.requestClaim()}>
          {t('verify.next')}
        </Button>
      {/if}
    </div>
  {/if}
</div>
