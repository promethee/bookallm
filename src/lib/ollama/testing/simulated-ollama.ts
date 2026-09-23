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
  /** When true, `/api/ps` fails like a dropped connection. */
  psFail?: boolean;
  /**
   * `/api/ps`'s running models. Undefined (the default) reports every installed model
   * as fully GPU-resident; set to `[]` for none accelerated, or a specific list for a
   * partial/zero-VRAM answer.
   */
  runningModels?: { model: string; size: number; size_vram: number }[];
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
  /** After this many embed requests, further ones never answer until aborted. */
  embedStallAfter?: number;
  /** Vectors to answer for exact texts; any other text gets the word-based fake vector. */
  embedFixed?: Record<string, number[]>;
  /** How many embed requests have arrived. Kept by the simulator; tests may reset it. */
  embedCalls?: number;
  /** Scripted text chunks a chat answer streams, one ndjson line each. Overrides the default. */
  chatChunks?: string[];
  /** When set, the chat stream ends with this error line instead of a `done` line. */
  chatError?: string;
  /** Pause before each streamed chat chunk, in milliseconds. */
  chatDelayMs?: number;
  /** After this many chat requests, further ones fail like a dropped connection. */
  chatDropAfter?: number;
  /** When set, chat requests never answer until they are aborted. */
  chatStall?: boolean;
  /** After this many streamed chat chunks, the rest of the stream hangs until aborted. */
  chatStallAfterChunks?: number;
  /** How many chat requests have arrived. Kept by the simulator; tests may reset it. */
  chatCalls?: number;
}

/** A deterministic default answer: echoes the question and cites the first passage. */
function defaultChatChunks(
  messages: { role: string; content: string }[],
): string[] {
  const question =
    messages.find((message) => message.role === 'user')?.content ?? '';
  return ['Answer: ', question, ' [1]'];
}

/** Default length of a simulated vector. */
export const DEFAULT_EMBED_DIMENSION = 8;

/**
 * A stand-in for an embedding: a unit vector made from the words and numbers of the text, so equal
 * texts give equal vectors and texts that share words are closer. Not a real model.
 */
export function fakeEmbedding(
  text: string,
  dimension = DEFAULT_EMBED_DIMENSION,
): number[] {
  const vector = new Array<number>(dimension).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
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
    'GET /api/ps': () => {
      if (state.psFail) throw new TypeError('fetch failed');
      // Default: every installed model is reported fully GPU-resident, so a test that
      // does not care about hardware acceleration is not affected by this check.
      const models =
        state.runningModels ??
        state.installed.map((name) => ({
          model: normalizeModelName(name),
          size: 1_000_000,
          size_vram: 1_000_000,
        }));
      return jsonResponse({ models });
    },
    'POST /api/chat': (request, signal) => {
      const { model, messages } = JSON.parse(request.body!) as {
        model: string;
        messages: { role: string; content: string }[];
      };
      state.chatCalls = (state.chatCalls ?? 0) + 1;
      if (
        state.chatDropAfter !== undefined &&
        state.chatCalls > state.chatDropAfter
      )
        throw new TypeError('fetch failed');
      if (state.chatStall) return neverAnswers(request, signal);
      const installed = state.installed.map(normalizeModelName);
      if (!installed.includes(normalizeModelName(model)))
        return jsonResponse(
          { error: `model "${model}" not found, try pulling it first` },
          404,
        );
      const chunks = state.chatChunks ?? defaultChatChunks(messages);
      const lines = chunks.map((content) =>
        ndjson({ message: { role: 'assistant', content }, done: false }),
      );
      if (state.chatStallAfterChunks !== undefined) {
        return streamResponse(lines.slice(0, state.chatStallAfterChunks), {
          delayMs: state.chatDelayMs,
          stall: true,
          signal,
        });
      }
      lines.push(
        state.chatError
          ? ndjson({ error: state.chatError })
          : ndjson({ message: { role: 'assistant', content: '' }, done: true }),
      );
      return streamResponse(lines, { delayMs: state.chatDelayMs, signal });
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
      if (
        state.embedStall ||
        (state.embedStallAfter !== undefined &&
          state.embedCalls > state.embedStallAfter)
      )
        return neverAnswers(request, signal);
      const installed = state.installed.map(normalizeModelName);
      if (!installed.includes(normalizeModelName(model)))
        return jsonResponse(
          { error: `model "${model}" not found, try pulling it first` },
          404,
        );
      const embeddings = input.map(
        (text) =>
          state.embedFixed?.[text] ?? fakeEmbedding(text, state.embedDimension),
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
