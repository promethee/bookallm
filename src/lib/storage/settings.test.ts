// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  isValidOllamaUrl,
  LocalStorageSettings,
  MemorySettings,
  parseSettings,
  type StorageLike,
} from './settings';

/** A stand-in for `localStorage` that several "sessions" can share. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  return { data, storage };
}

const KEY = 'bookallm.settings';

describe('LocalStorageSettings', () => {
  it('uses the defaults, with no language chosen, when nothing is saved', () => {
    const { storage } = fakeStorage();

    const settings = new LocalStorageSettings(() => storage).load();

    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.language).toBeUndefined();
  });

  it('restores what was saved after a "restart"', () => {
    const { storage } = fakeStorage();
    new LocalStorageSettings(() => storage).save({
      language: 'fr',
      chatModel: 'qwen2.5:3b',
      embeddingModel: 'nomic-embed-text',
      ollamaUrl: 'http://ollama.lan:9999',
      activeBook: 'abc123',
    });

    const restored = new LocalStorageSettings(() => storage).load();

    expect(restored).toEqual({
      language: 'fr',
      chatModel: 'qwen2.5:3b',
      embeddingModel: 'nomic-embed-text',
      ollamaUrl: 'http://ollama.lan:9999',
      activeBook: 'abc123',
    });
  });

  it('merges a change into the existing settings instead of replacing them', () => {
    const { storage } = fakeStorage();
    const settings = new LocalStorageSettings(() => storage);
    settings.save({ language: 'fr' });

    settings.save({ chatModel: 'qwen2.5:3b' });

    expect(new LocalStorageSettings(() => storage).load()).toMatchObject({
      language: 'fr',
      chatModel: 'qwen2.5:3b',
    });
  });

  it('can clear the active book', () => {
    const { storage } = fakeStorage();
    const settings = new LocalStorageSettings(() => storage);
    settings.save({ activeBook: 'abc' });

    settings.save({ activeBook: undefined });

    expect(
      new LocalStorageSettings(() => storage).load().activeBook,
    ).toBeUndefined();
  });

  it('is undefined for the hardware check by default and survives a save/load cycle', () => {
    const { storage } = fakeStorage();
    expect(
      new LocalStorageSettings(() => storage).load().hardwareCheckResolved,
    ).toBeUndefined();

    new LocalStorageSettings(() => storage).save({
      hardwareCheckResolved: true,
    });

    expect(
      new LocalStorageSettings(() => storage).load().hardwareCheckResolved,
    ).toBe(true);
  });

  it('trims model names', () => {
    const { storage } = fakeStorage();
    const settings = new LocalStorageSettings(() => storage);

    settings.save({ chatModel: '  qwen2.5:3b  ' });

    expect(settings.load().chatModel).toBe('qwen2.5:3b');
  });

  it('starts with the defaults when the saved text is damaged, without reporting a problem', () => {
    const { storage } = fakeStorage({ [KEY]: '{not json' });
    const settings = new LocalStorageSettings(() => storage);

    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
    expect(settings.problem()).toBeUndefined();
  });

  it('keeps the valid fields when only one saved value is invalid', () => {
    const { storage } = fakeStorage({
      [KEY]: JSON.stringify({
        version: 1,
        language: 'fr',
        chatModel: '',
        embeddingModel: 'nomic-embed-text',
        ollamaUrl: 'not a url',
      }),
    });

    expect(new LocalStorageSettings(() => storage).load()).toEqual({
      language: 'fr',
      chatModel: DEFAULT_SETTINGS.chatModel,
      embeddingModel: 'nomic-embed-text',
      ollamaUrl: DEFAULT_SETTINGS.ollamaUrl,
    });
  });

  it('works in memory and reports a problem when storage is blocked', () => {
    const settings = new LocalStorageSettings(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    settings.save({ language: 'fr' });

    expect(settings.problem()).toBe('unavailable');
    expect(settings.load().language).toBe('fr');
  });

  it('works in memory and reports a problem when there is no storage at all', () => {
    const settings = new LocalStorageSettings(() => undefined);

    settings.save({ chatModel: 'qwen2.5:3b' });

    expect(settings.problem()).toBe('unavailable');
    expect(settings.load().chatModel).toBe('qwen2.5:3b');
  });

  it('reports "full" and keeps the value for this session when a save runs out of room', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const settings = new LocalStorageSettings(() => storage);

    settings.save({ language: 'fr' });

    expect(settings.problem()).toBe('full');
    expect(settings.load().language).toBe('fr');
  });

  it('reports "unavailable" when a save fails for another reason', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('disk on fire');
      },
    };
    const settings = new LocalStorageSettings(() => storage);

    settings.save({ language: 'fr' });

    expect(settings.problem()).toBe('unavailable');
  });

  it('reports "unavailable" when reading fails', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('nope');
      },
      setItem: () => undefined,
    };

    expect(new LocalStorageSettings(() => storage).problem()).toBe(
      'unavailable',
    );
  });
});

describe('parseSettings', () => {
  it('drops an unknown language', () => {
    expect(parseSettings({ language: 'de' }).language).toBeUndefined();
  });

  it.each([[false], ['true'], [1], [null]])(
    'ignores a non-true hardwareCheckResolved value (%j)',
    (raw) => {
      expect(
        parseSettings({ hardwareCheckResolved: raw }).hardwareCheckResolved,
      ).toBeUndefined();
    },
  );

  it.each([[null], ['text'], [42], [[]]])(
    'gives the defaults for %j',
    (raw) => {
      expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    },
  );

  it('ignores an empty active book', () => {
    expect(parseSettings({ activeBook: '  ' }).activeBook).toBeUndefined();
  });
});

describe('isValidOllamaUrl', () => {
  it.each([
    ['http://127.0.0.1:11434', true],
    ['https://ollama.example.com', true],
    ['  http://localhost:11434  ', true],
    ['ftp://example.com', false],
    ['javascript:alert(1)', false],
    ['not a url', false],
    ['', false],
    ['http://', false],
    ['127.0.0.1:11434', false],
  ])('%j is %s', (text, expected) => {
    expect(isValidOllamaUrl(text)).toBe(expected);
  });
});

describe('MemorySettings', () => {
  it('behaves like the stored settings without storing', () => {
    const settings = new MemorySettings();

    settings.save({ language: 'fr', chatModel: ' x:1 ' });

    expect(settings.load()).toMatchObject({ language: 'fr', chatModel: 'x:1' });
    expect(settings.problem()).toBeUndefined();
  });

  it('can carry the problem that made it necessary', () => {
    expect(new MemorySettings('unavailable').problem()).toBe('unavailable');
  });
});
