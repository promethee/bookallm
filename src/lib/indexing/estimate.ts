/** How many chunks must be done in a run before any time is promised. */
export const ESTIMATE_MIN_CHUNKS = 8;

/**
 * What is needed to work out a pace during one indexing run: how many chunks were done
 * when the run began, and the moment the first batch came back. The first batch is left
 * out of the pace because it includes Ollama loading the model, which took about 16
 * seconds on a real computer and would make everything after it look slower.
 */
export interface Pace {
  startChunks: number;
  first?: { chunks: number; at: number };
}

/**
 * Feeds a progress report into the pace record. Call it for every report of a run,
 * passing the current time in milliseconds. A count lower than the run's start means the
 * index started again from scratch, so the record starts again too.
 */
export function updatePace(
  pace: Pace | undefined,
  chunksDone: number,
  now: number,
): Pace {
  if (!pace || chunksDone < pace.startChunks)
    return { startChunks: chunksDone };
  if (!pace.first && chunksDone > pace.startChunks)
    return { ...pace, first: { chunks: chunksDone, at: now } };
  return pace;
}

/**
 * Milliseconds left at the pace measured since the first batch, or undefined while there
 * is not enough to say: fewer than `ESTIMATE_MIN_CHUNKS` done in this run, no chunk done
 * since the first batch, or no time passed. Only the chunks still to do are counted, so a
 * resumed index is judged by this run's pace alone.
 */
export function estimateRemainingMs(
  pace: Pace,
  chunksDone: number,
  chunksTotal: number,
  now: number,
): number | undefined {
  const { first } = pace;
  if (!first || chunksDone - pace.startChunks < ESTIMATE_MIN_CHUNKS)
    return undefined;
  if (chunksDone >= chunksTotal) return 0;
  const chunks = chunksDone - first.chunks;
  const elapsed = now - first.at;
  if (chunks <= 0 || elapsed <= 0) return undefined;
  return ((chunksTotal - chunksDone) * elapsed) / chunks;
}

export type RemainingTime =
  { kind: 'under-a-minute' } | { kind: 'about'; minutes: number };

/**
 * Rounds a time so it never claims more precision than it has: under 45 seconds is "under
 * a minute", then whole minutes up to 10, then 5 minutes up to an hour, then quarter
 * hours.
 */
export function roundRemaining(ms: number): RemainingTime {
  if (ms < 45_000) return { kind: 'under-a-minute' };
  const minutes = ms / 60_000;
  const step = minutes < 10 ? 1 : minutes < 60 ? 5 : 15;
  return {
    kind: 'about',
    minutes: Math.max(1, Math.round(minutes / step) * step),
  };
}
