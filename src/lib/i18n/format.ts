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

/**
 * A length of time in whole minutes as the language writes it: "25 minutes",
 * "1 hour", "4 hours 30 minutes" (French: "4 heures 30 minutes").
 */
export function formatMinutes(minutes: number, language: Language): string {
  const unit = (value: number, name: 'hour' | 'minute') =>
    new Intl.NumberFormat(language, {
      style: 'unit',
      unit: name,
      unitDisplay: 'long',
    }).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours > 0 && unit(hours, 'hour'), rest > 0 && unit(rest, 'minute')]
    .filter(Boolean)
    .join(' ');
}

/**
 * Progress as a percentage with two decimals ("13.74%", French "13,74 %"). The value is
 * rounded down, never up, so a nearly finished job never reads "100.00%" before it is
 * done. The result is clamped between 0 and 1.
 */
export function formatProgress(fraction: number, language: Language): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  return new Intl.NumberFormat(language, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.floor(clamped * 10_000 + 1e-9) / 10_000);
}

/** A whole-number percentage such as "28 %" (French) or "28%" (English). */
export function formatPercent(fraction: number, language: Language): string {
  return new Intl.NumberFormat(language, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(Math.min(1, Math.max(0, fraction)));
}
