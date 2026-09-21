// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { formatBytes, formatPercent } from './format';
import { detectLanguage, isLanguage } from './language';
import { en, fr, type MessageKey } from './messages';
import { getLanguage, setLanguage, t } from './state.svelte';
import { compareKeys, translate, type Tables } from './translate';

/** Intl uses no-break spaces between a number and its unit; compare with plain ones. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('translate', () => {
  it('looks a message up in the chosen language', () => {
    expect(translate('en', 'common.tryAgain')).toBe('Try again');
    expect(translate('fr', 'common.tryAgain')).toBe('Réessayer');
  });

  it('fills {name} slots and leaves an unknown slot visible instead of failing', () => {
    const tables: Tables = {
      en: { 'app.name': 'Hello {who}, {missing}' },
      fr: {},
    };

    expect(translate('en', 'app.name', { who: 'Ada' }, tables)).toBe(
      'Hello Ada, {missing}',
    );
  });

  it('runs plural functions', () => {
    expect(translate('en', 'common.chapters', { count: 1 })).toBe('1 chapter');
    expect(translate('en', 'common.chapters', { count: 22 })).toBe(
      '22 chapters',
    );
    expect(translate('fr', 'common.chapters', { count: 1 })).toBe('1 chapitre');
    expect(translate('fr', 'common.chapters', { count: 22 })).toBe(
      '22 chapitres',
    );
  });

  it('falls back to English when the chosen language lacks a message', () => {
    const tables: Tables = { en, fr: { 'common.cancel': 'Annuler' } };

    expect(translate('fr', 'common.cancel', {}, tables)).toBe('Annuler');
    expect(translate('fr', 'common.tryAgain', {}, tables)).toBe('Try again');
  });

  it('never shows an internal key: a message missing everywhere is empty', () => {
    const tables: Tables = { en: {}, fr: {} };

    expect(translate('fr', 'common.tryAgain', {}, tables)).toBe('');
  });
});

describe('the current language', () => {
  afterEach(() => setLanguage('en'));

  it('starts in English and switches text at once', () => {
    expect(getLanguage()).toBe('en');
    expect(t('common.continue')).toBe('Continue');

    setLanguage('fr');

    expect(getLanguage()).toBe('fr');
    expect(t('common.continue')).toBe('Continuer');
  });
});

describe('detectLanguage', () => {
  it.each([
    [['fr-FR'], 'fr'],
    [['fr'], 'fr'],
    [['fr_CA'], 'fr'],
    [['en-US'], 'en'],
    [['en-US', 'fr'], 'en'],
    [['fr', 'en'], 'fr'],
    [['de', 'fr-CA'], 'fr'],
    [['de', 'es'], 'en'],
    [[], 'en'],
  ])('reads %j as %s', (preferred, expected) => {
    expect(detectLanguage(preferred)).toBe(expected);
  });

  it('gives English when the system offers nothing', () => {
    expect(detectLanguage(undefined)).toBe('en');
  });

  it('recognises supported language codes only', () => {
    expect(isLanguage('fr')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage(3)).toBe(false);
  });
});

describe('formatBytes and formatPercent', () => {
  it('writes 4.9 GB in English and 4,9 Go in French', () => {
    expect(plain(formatBytes(4_900_000_000, 'en'))).toBe('4.9 GB');
    expect(plain(formatBytes(4_900_000_000, 'fr'))).toBe('4,9 Go');
  });

  it('writes megabytes without decimals', () => {
    expect(plain(formatBytes(45_949_216, 'en'))).toBe('46 MB');
    expect(plain(formatBytes(45_949_216, 'fr'))).toBe('46 Mo');
  });

  it('writes small sizes in kilobytes', () => {
    expect(plain(formatBytes(12_000, 'en'))).toBe('12 kB');
  });

  it('writes percentages with each language’s conventions', () => {
    expect(plain(formatPercent(0.284, 'en'))).toBe('28%');
    expect(plain(formatPercent(0.284, 'fr'))).toBe('28 %');
  });

  it('keeps a percentage between 0 and 100', () => {
    expect(plain(formatPercent(1.4, 'en'))).toBe('100%');
    expect(plain(formatPercent(-1, 'en'))).toBe('0%');
  });
});

describe('language parity', () => {
  it('has the same messages in English and French', () => {
    expect(compareKeys(en, fr)).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('reports a message missing from one language', () => {
    const frWithoutCancel = Object.fromEntries(
      Object.entries(fr).filter(([key]) => key !== 'common.cancel'),
    );

    expect(compareKeys(en, frWithoutCancel)).toEqual({
      onlyInA: ['common.cancel'],
      onlyInB: [],
    });
  });

  it('reports a message that exists only in French', () => {
    expect(compareKeys(en, { ...fr, extra: 'x' })).toEqual({
      onlyInA: [],
      onlyInB: ['extra'],
    });
  });

  it('has no empty French message', () => {
    for (const key of Object.keys(fr) as MessageKey[]) {
      const message = fr[key];
      const text =
        typeof message === 'function' ? message({ count: 2 }) : message;
      expect(text.trim(), key).not.toBe('');
    }
  });
});
