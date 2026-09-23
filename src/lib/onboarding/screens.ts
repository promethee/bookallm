import type { Language } from '../i18n/language';
import type { SetupReadiness } from '../ollama';

export type Screen =
  | 'language'
  | 'checking'
  | 'get-ollama'
  | 'update-ollama'
  | 'pull-models'
  | 'hardware-warning'
  | 'index-book'
  | 'import-book'
  | 'landing';

/**
 * Whether the active book has vectors for the configured embedding model. `unknown`
 * until it has been worked out, `ready` when it has (or there is nothing to index), and
 * `needed` when indexing has to run.
 */
export type IndexNeed = 'unknown' | 'ready' | 'needed';

/**
 * The result of checking whether Ollama can accelerate answers on this machine.
 * `unknown` until the check has run; `skip` once it is resolved (already accelerated, or
 * the warning already acknowledged) and does not need to run or be shown again.
 */
export type HardwareCheck =
  'unknown' | 'accelerated' | 'not-accelerated' | 'inconclusive' | 'skip';

export interface ScreenInput {
  /** The language the reader has chosen and saved; undefined on the first launch. */
  language: Language | undefined;
  /** Undefined while the real state is still being determined. */
  readiness: SetupReadiness | undefined;
  bookCount: number;
  /** Only looked at once Ollama and both models are ready. */
  index: IndexNeed;
  /** Only looked at once Ollama and both models are ready. */
  hardwareCheck: HardwareCheck;
  /** The reader chose "not now" on the import screen this session. */
  importPostponed: boolean;
  /** An import was asked for (from the landing screen) or is being shown. */
  importRequested: boolean;
}

/**
 * The one screen to show, worked out from what is really true. The order is fixed:
 * language, checking, get Ollama, update Ollama, download models, the hardware warning,
 * index the active book, import a first book, landing. There is no stored "setup
 * finished" flag, so the screen can never disagree with reality: if Ollama stops later,
 * the get-Ollama screen comes back.
 */
export function decideScreen(input: ScreenInput): Screen {
  if (input.language === undefined) return 'language';
  if (input.readiness === undefined) return 'checking';

  switch (input.readiness.step) {
    case 'get-ollama':
      return 'get-ollama';
    case 'update-ollama':
      return 'update-ollama';
    case 'pull-models':
      return 'pull-models';
    case 'ready':
      if (input.hardwareCheck === 'unknown') return 'checking';
      if (input.hardwareCheck === 'not-accelerated') return 'hardware-warning';
      if (input.index === 'unknown') return 'checking';
      if (input.index === 'needed') return 'index-book';
      if (input.importRequested) return 'import-book';
      if (input.bookCount === 0 && !input.importPostponed) return 'import-book';
      return 'landing';
  }
}
