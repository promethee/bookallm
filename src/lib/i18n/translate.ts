import type { Language } from './language';
import { en, fr, type Message, type MessageKey, type Params } from './messages';

export type Tables = Record<Language, Partial<Record<MessageKey, Message>>>;

export const TABLES: Tables = { en, fr };

const fill = (text: string, params: Params): string =>
  text.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in params ? String(params[name]) : slot,
  );

/**
 * Looks a message up in the chosen language and fills its slots. A message missing
 * from that language falls back to English, and one missing everywhere gives an empty
 * string: an internal key is never shown to a reader.
 */
export function translate(
  language: Language,
  key: MessageKey,
  params: Params = {},
  tables: Tables = TABLES,
): string {
  const message = tables[language][key] ?? tables.en[key];
  if (message === undefined) return '';
  return typeof message === 'function'
    ? message(params)
    : fill(message, params);
}

/** Keys present in one table and absent from the other, for the parity check. */
export function compareKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): { onlyInA: string[]; onlyInB: string[] } {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return {
    onlyInA: keysA.filter((key) => !(key in b)),
    onlyInB: keysB.filter((key) => !(key in a)),
  };
}
