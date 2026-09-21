import type { OllamaClient } from './client';
import {
  APPROX_MODEL_BYTES,
  DEFAULT_MODELS,
  LIST_MODELS_TIMEOUT_MS,
} from './defaults';
import type {
  DownloadPlan,
  DownloadPlanItem,
  ModelCheckResult,
  ModelReport,
  ModelRole,
  RequiredModels,
} from './types';

/** Roles in a stable order for reports. */
const ROLES: readonly ModelRole[] = ['chat', 'embedding'];

/**
 * How model names are compared: trimmed, lower-cased, and a name without a tag means
 * `latest`. A colon only counts as a tag separator after the last slash, so a registry
 * address with a port (`localhost:5000/team/model`) is not mistaken for a tag.
 */
export function normalizeModelName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const hasTag = trimmed.lastIndexOf(':') > trimmed.lastIndexOf('/');
  return hasTag ? trimmed : `${trimmed}:latest`;
}

/**
 * Names of the models Ollama has installed, normalised, or undefined when the list
 * cannot be read (no answer, an error status, or a body that is not a model list).
 */
export async function readInstalledModels(
  client: OllamaClient,
): Promise<string[] | undefined> {
  try {
    const response = await client.request('/api/tags', {
      signal: AbortSignal.timeout(LIST_MODELS_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || !('models' in body))
      return undefined;
    if (!Array.isArray(body.models)) return undefined;
    return body.models.flatMap((model: unknown) =>
      typeof model === 'object' &&
      model !== null &&
      'name' in model &&
      typeof model.name === 'string'
        ? [normalizeModelName(model.name)]
        : [],
    );
  } catch {
    return undefined;
  }
}

/**
 * Reports whether each required model is installed. A list that cannot be read is an
 * `unreachable` error, never "nothing installed", so a dead server does not look like
 * an empty one.
 */
export async function checkModels(
  client: OllamaClient,
  required: RequiredModels = DEFAULT_MODELS,
): Promise<ModelCheckResult> {
  const installed = await readInstalledModels(client);
  if (!installed) return { ok: false, error: { code: 'unreachable' } };

  const names = new Set(installed);
  const models: ModelReport = ROLES.map((role) => ({
    role,
    model: required[role],
    installed: names.has(normalizeModelName(required[role])),
  }));
  return { ok: true, models };
}

/**
 * What a download would fetch: the missing models with approximate sizes where known.
 * Pure: it looks at a report and never downloads anything.
 */
export function planDownloads(report: ModelReport): DownloadPlan {
  const items: DownloadPlanItem[] = report
    .filter((status) => !status.installed)
    .map(({ role, model }) => {
      const approxBytes = APPROX_MODEL_BYTES[normalizeModelName(model)];
      return approxBytes === undefined
        ? { role, model }
        : { role, model, approxBytes };
    });
  const totalKnownBytes = items.reduce(
    (sum, item) => sum + (item.approxBytes ?? 0),
    0,
  );
  return { items, totalKnownBytes };
}
