import type { DrmScheme, IngestError, IngestErrorCode } from './types';

/** Outcome of an ingestion step: a value, or a typed error (never thrown). */
export type Result<T> =
  { ok: true; value: T } | { ok: false; error: IngestError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T = never>(
  code: IngestErrorCode,
  scheme?: DrmScheme,
): Result<T> => ({
  ok: false,
  error: scheme ? { code, scheme } : { code },
});
