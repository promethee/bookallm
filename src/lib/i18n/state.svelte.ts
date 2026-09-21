import type { Language } from './language';
import type { MessageKey, Params } from './messages';
import { translate } from './translate';

let current = $state<Language>('en');

/** The interface language in use. Reading it inside a component keeps the text up to date. */
export const getLanguage = (): Language => current;

/** Switches the interface language at once; every `t(...)` in view updates. */
export function setLanguage(language: Language): void {
  current = language;
}

/** Text for `key` in the current language. Components call this instead of holding text. */
export const t = (key: MessageKey, params?: Params): string =>
  translate(current, key, params);
