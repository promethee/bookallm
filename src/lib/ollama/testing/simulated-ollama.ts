import {
  createFakeFetch,
  jsonResponse,
  ndjson,
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
