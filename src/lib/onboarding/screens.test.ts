// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { SetupReadiness } from '../ollama';
import { decideScreen, type Screen, type ScreenInput } from './screens';

const ready: SetupReadiness = { step: 'ready', version: '0.34.0', models: [] };
const pull: SetupReadiness = {
  step: 'pull-models',
  version: '0.34.0',
  models: [],
  plan: { items: [], totalKnownBytes: 0 },
};
const update: SetupReadiness = {
  step: 'update-ollama',
  version: '0.3.0',
  minimumVersion: '0.3.4',
};
const get: SetupReadiness = { step: 'get-ollama' };

const base: ScreenInput = {
  language: 'en',
  readiness: ready,
  bookCount: 1,
  importPostponed: false,
  importRequested: false,
};

const cases: [string, Partial<ScreenInput>, Screen][] = [
  [
    'no language chosen yet (first launch)',
    { language: undefined, readiness: undefined },
    'language',
  ],
  [
    'no language, even if the state is somehow known',
    { language: undefined },
    'language',
  ],
  [
    'language chosen but the state is still being checked',
    { readiness: undefined },
    'checking',
  ],
  ['Ollama is not running', { readiness: get }, 'get-ollama'],
  ['Ollama is too old', { readiness: update }, 'update-ollama'],
  ['a model is missing', { readiness: pull }, 'pull-models'],
  ['everything ready and a book exists', {}, 'landing'],
  ['ready with no book yet', { bookCount: 0 }, 'import-book'],
  [
    'ready with no book, import postponed',
    { bookCount: 0, importPostponed: true },
    'landing',
  ],
  [
    'ready with a book, import requested from the landing screen',
    { importRequested: true },
    'import-book',
  ],
  [
    'ready with no book, postponed, then import requested',
    { bookCount: 0, importPostponed: true, importRequested: true },
    'import-book',
  ],
  [
    'an old Ollama beats missing books',
    { readiness: update, bookCount: 0 },
    'update-ollama',
  ],
  [
    'a stopped Ollama beats a requested import',
    { readiness: get, importRequested: true },
    'get-ollama',
  ],
  [
    'missing models beat a requested import',
    { readiness: pull, importRequested: true },
    'pull-models',
  ],
];

describe('decideScreen', () => {
  it.each(cases)('%s', (_name, override, expected) => {
    expect(decideScreen({ ...base, ...override })).toBe(expected);
  });

  it('works for French too', () => {
    expect(decideScreen({ ...base, language: 'fr', bookCount: 0 })).toBe(
      'import-book',
    );
  });
});
