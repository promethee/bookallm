import type { Language } from './language';

const GIGABYTE = 1_000_000_000;
const MEGABYTE = 1_000_000;

/**
 * A download size for the reader: decimal units, one decimal for gigabytes and none for
 * smaller sizes, with the language's own conventions ("4.9 GB" in English, "4,9 Go"
 * in French). Ollama reports sizes in decimal units, so the same are shown here.
 */
export function formatBytes(bytes: number, language: Language): string {
  const [unit, divisor, digits] =
    bytes >= GIGABYTE
      ? (['gigabyte', GIGABYTE, 1] as const)
      : bytes >= MEGABYTE
        ? (['megabyte', MEGABYTE, 0] as const)
        : (['kilobyte', 1000, 0] as const);
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: digits,
  }).format(bytes / divisor);
}

/** A whole-number percentage such as "28 %" (French) or "28%" (English). */
export function formatPercent(fraction: number, language: Language): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Math.min(1, Math.max(0, fraction)));
}
