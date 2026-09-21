export const LANGUAGES = ['en', 'fr'] as const;

export type Language = (typeof LANGUAGES)[number];

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/**
 * The language to preselect from the system's preferred languages, most preferred
 * first. The first entry that is English or French wins, so `['en-US', 'fr']` is
 * English and `['de', 'fr-CA']` is French. Anything else, or nothing, is English.
 */
export function detectLanguage(
  preferred: readonly string[] | undefined,
): Language {
  for (const tag of preferred ?? []) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (primary === 'fr') return 'fr';
    if (primary === 'en') return 'en';
  }
  return 'en';
}
