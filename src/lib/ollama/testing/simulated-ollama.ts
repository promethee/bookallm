import { normalizeModelName } from '../models';
import {
  createFakeFetch,
  jsonResponse,
  ndjson,
  neverAnswers,
  streamResponse,
  type FakeFetch,
  type FakeHandler,
} from './fake-fetch';

/** The state of a simulated Ollama. Tests change it while a flow is running. */
export interface OllamaState {
  /** Undefined means Ollama is not reachable at all. */
  version?: string;
  installed: string[];
  /** When true, the version answers but the model list does not. */
  tagsFail?: boolean;
  /** Models whose pull ends with an error line, by name. */
  pullErrors?: Record<string, string>;
  /** When set, version requests wait for this promise before answering. */
  versionGate?: Promise<void>;
  /** When set, pulls send a first progress line and then stall until cancelled. */
  stallPulls?: boolean;
  /** When set, pulls send a first progress line and then the connection drops. */
  dropPulls?: boolean;
  /** When set, pulls send every byte, then `verifying`, and stall until cancelled. */
  stallAtVerify?: boolean;
  /** How many numbers each simulated vector has. Defaults to 8. */
  embedDimension?: number;
  /** When set, embed answers have one vector too few. */
  embedWrongCount?: boolean;
  /** After this many embed requests, further ones fail like a dropped connection. */
  embedDropAfter?: number;
  /** When set, embed requests never answer until they are aborted. */
  embedStall?: boolean;
  /** How many embed requests have arrived. Kept by the simulator; tests may reset it. */
  embedCalls?: number;
}

/** Default length of a simulated vector. */
export const DEFAULT_EMBED_DIMENSION = 8;

/**
 * A stand-in for an embedding: a unit vector made from the words of the text, so equal
 * texts give equal vectors and texts that share words are closer. Not a real model.
 */
export function fakeEmbedding(
  text: string,
  dimension = DEFAULT_EMBED_DIMENSION,
): number[] {
  const vector = new Array<number>(dimension).fill(0);
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    let hash = 2166136261;
    for (const char of word) {
      hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
    }
    vector[hash % dimension] += 1;
  }
  const norm = Math.hypot(...vector);
  if (norm === 0) vector[0] = 1;
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

/** Fake `fetch` routes that behave like Ollama's version, model list and pull endpoints. */
export function simulateOllama(state: OllamaState): FakeFetch {
  const routes: Record<string, FakeHandler> = {
    'GET /api/version': async () => {
      await state.versionGate;
      if (!state.version) throw new TypeError('fetch failed');
      return jsonResponse({ version: state.version });
    },
    'GET /api/tags': () => {
      if (state.tagsFail) throw new TypeError('fetch failed');
      return jsonResponse({
        models: state.installed.map((name) => ({ name })),
      });
    },
    'POST /api/embed': (request, signal) => {
      const { model, input } = JSON.parse(request.body!) as {
        model: string;
        input: string[];
      };
      state.embedCalls = (state.embedCalls ?? 0) + 1;
      if (
        state.embedDropAfter !== undefined &&
        state.embedCalls > state.embedDropAfter
      )
        throw new TypeError('fetch failed');
      if (state.embedStall) return neverAnswers(request, signal);
      const installed = state.installed.map(normalizeModelName);
      if (!installed.includes(normalizeModelName(model)))
        return jsonResponse(
          { error: `model "${model}" not found, try pulling it first` },
          404,
        );
      const embeddings = input.map((text) =>
        fakeEmbedding(text, state.embedDimension),
      );
      if (state.embedWrongCount) embeddings.pop();
      return jsonResponse({ model, embeddings });
    },
    'POST /api/pull': (request, signal) => {
      const { model } = JSON.parse(request.body!) as { model: string };
      const error = state.pullErrors?.[model];
      if (error)
        return streamResponse([
          ndjson({ status: 'pulling manifest' }, { error }),
        ]);
      if (state.stallAtVerify) {
        return streamResponse(
          [
            ndjson(
              { status: 'pulling manifest' },
              {
                digest: `d-${model}`,
                total: 100_000_000,
                completed: 100_000_000,
              },
              { status: 'verifying sha256 digest' },
            ),
          ],
          { stall: true, signal },
        );
      }
      if (state.dropPulls) {
        return streamResponse(
          [
            ndjson(
              { status: 'pulling manifest' },
              {
                digest: `d-${model}`,
                total: 100_000_000,
                completed: 30_000_000,
              },
            ),
          ],
          { failWith: new TypeError('terminated') },
        );
      }
      if (state.stallPulls) {
        return streamResponse(
          [
            ndjson(
              { status: 'pulling manifest' },
              {
                digest: `d-${model}`,
                total: 100_000_000,
                completed: 30_000_000,
              },
            ),
          ],
          { stall: true, signal },
        );
      }
      state.installed.push(model.includes(':') ? model : `${model}:latest`);
      return streamResponse([
        ndjson(
          { status: 'pulling manifest' },
          {
            status: 'pulling x',
            digest: `d-${model}`,
            total: 10,
            completed: 5,
          },
          {
            status: 'pulling x',
            digest: `d-${model}`,
            total: 10,
            completed: 10,
          },
          { status: 'success' },
        ),
      ]);
    },
  };
  return createFakeFetch(routes);
}
