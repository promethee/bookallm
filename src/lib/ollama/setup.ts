import type { OllamaClient } from './client';
import { DEFAULT_MODELS } from './defaults';
import { detectOllama } from './detect';
import { checkModels, planDownloads } from './models';
import { pullModel } from './pull';
import type {
  ModelPullProgress,
  PullMissingResult,
  RequiredModels,
  SetupReadiness,
} from './types';

export interface PullMissingOptions {
  /** Aborting this cancels the model currently downloading and starts no later one. */
  signal?: AbortSignal;
  /** Progress of whichever model is downloading; `model` names it. */
  onProgress?: (progress: ModelPullProgress) => void;
}

/**
 * Downloads every missing required model, one after another, on one explicit request.
 * Models already installed are skipped. It stops at the first failure or cancellation
 * without starting a later model. The embedding model goes first: it is the small one,
 * so it finishes quickly and shows that downloading works before the large chat model.
 */
export async function pullMissingModels(
  client: OllamaClient,
  required: RequiredModels = DEFAULT_MODELS,
  options: PullMissingOptions = {},
): Promise<PullMissingResult> {
  const check = await checkModels(client, required);
  if (!check.ok) return { status: 'failed', pulled: [], error: check.error };

  const order = ['embedding', 'chat'] as const;
  const missing = order.flatMap((role) =>
    check.models.filter((status) => status.role === role && !status.installed),
  );

  const pulled: string[] = [];
  for (const { model } of missing) {
    const result = await pullModel(client, model, {
      signal: options.signal,
      onProgress: (progress) => options.onProgress?.({ ...progress, model }),
    });
    if (result.status === 'cancelled')
      return { status: 'cancelled', pulled, model };
    if (result.status === 'failed')
      return { status: 'failed', pulled, model, error: result.error };
    pulled.push(model);
  }
  return { status: 'success', pulled };
}

/**
 * Says what the reader has to do next, in a fixed priority: get Ollama (it is not
 * reachable), update it, pull missing models, or nothing (`ready`). It checks the real
 * state on every call, remembers nothing, and only reads, so it is safe to call again
 * after the reader installs Ollama or after a download finishes.
 */
export async function checkSetup(
  client: OllamaClient,
  required: RequiredModels = DEFAULT_MODELS,
): Promise<SetupReadiness> {
  const ollama = await detectOllama(client);
  if (ollama.status === 'unreachable') return { step: 'get-ollama' };
  if (ollama.status === 'outdated') {
    return {
      step: 'update-ollama',
      version: ollama.version,
      minimumVersion: ollama.minimumVersion,
    };
  }

  const check = await checkModels(client, required);
  // Ollama answered the version check but not the model list: treat it as gone.
  if (!check.ok) return { step: 'get-ollama' };

  const missing = check.models.some((status) => !status.installed);
  return missing
    ? {
        step: 'pull-models',
        version: ollama.version,
        models: check.models,
        plan: planDownloads(check.models),
      }
    : { step: 'ready', version: ollama.version, models: check.models };
}
