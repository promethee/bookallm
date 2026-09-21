// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  checkSetup,
  createOllamaClient,
  detectOllama,
  pullModel,
} from './index';
import type { PullProgress } from './types';

/**
 * Manual checks against a real Ollama. Skipped unless `OLLAMA_URL` is set:
 *
 *   OLLAMA_URL=http://127.0.0.1:11434 pnpm exec vitest run real-ollama --reporter=verbose --disable-console-intercept
 *
 * The detection and readiness checks only read. Downloading is a separate opt-in: set
 * `OLLAMA_PULL_MODEL` to a small model name to pull it (this can download data). The
 * results are printed for a person to read; nothing here is an automated judgment of
 * Ollama itself.
 */
const baseUrl = process.env.OLLAMA_URL;
const pullModelName = process.env.OLLAMA_PULL_MODEL;

describe.skipIf(!baseUrl)('real Ollama (manual check)', () => {
  const client = createOllamaClient({ baseUrl });

  it('detects the server and reports readiness', async () => {
    const detection = await detectOllama(client);
    const readiness = await checkSetup(client);

    console.log(
      [
        'detection:',
        JSON.stringify(detection, null, 2),
        'readiness:',
        JSON.stringify(readiness, null, 2),
      ].join('\n'),
    );

    expect(detection.status).not.toBe('unreachable');
    expect(['pull-models', 'ready', 'update-ollama']).toContain(readiness.step);
  });

  it.skipIf(!pullModelName)(
    'cancels a real download part-way and resumes it (the model must not be installed yet)',
    async () => {
      const controller = new AbortController();
      let cancelledAtBytes = 0;
      let totalAtCancel = 0;

      const first = await pullModel(client, pullModelName!, {
        signal: controller.signal,
        onProgress: (progress) => {
          const started =
            progress.phase === 'downloading' && progress.completedBytes > 0;
          const partway =
            (progress.fraction ?? 0) > 0.1 && (progress.fraction ?? 0) < 0.9;
          if (started && partway && !controller.signal.aborted) {
            cancelledAtBytes = progress.completedBytes;
            totalAtCancel = progress.totalBytes;
            controller.abort();
          }
        },
      });

      const updates: PullProgress[] = [];
      const second = await pullModel(client, pullModelName!, {
        onProgress: (progress) => updates.push(progress),
      });
      const firstDownloading = updates.find(
        (update) => update.phase === 'downloading',
      );

      console.log(
        [
          `first pull: ${JSON.stringify(first)} (cancelled at ${cancelledAtBytes} of ${totalAtCancel} bytes)`,
          `second pull: ${JSON.stringify(second)}, ${updates.length} progress updates`,
          `second pull's first downloading update: ${JSON.stringify(firstDownloading)}`,
          `last update: ${JSON.stringify(updates.at(-1))}`,
        ].join('\n'),
      );

      expect(first.status).toBe('cancelled');
      expect(second.status).toBe('success');
      // Resumed rather than restarted: the second pull begins with bytes already present.
      expect(firstDownloading?.completedBytes).toBeGreaterThan(0);
    },
    120_000,
  );

  it.skipIf(!pullModelName)(
    'pulls the model named by OLLAMA_PULL_MODEL',
    async () => {
      const updates: PullProgress[] = [];

      const result = await pullModel(client, pullModelName!, {
        onProgress: (progress) => updates.push(progress),
      });

      const phases = [...new Set(updates.map((update) => update.phase))];
      const last = updates.at(-1);
      console.log(
        [
          `pull of ${pullModelName}: ${JSON.stringify(result)}`,
          `progress updates: ${updates.length}, phases seen: ${phases.join(' > ')}`,
          `last: ${JSON.stringify(last)}`,
        ].join('\n'),
      );

      expect(result.status).toBe('success');
      expect(last?.phase).toBe('done');
    },
  );
});
