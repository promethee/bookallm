import type { PullPhase, PullProgress } from './types';

/** The fields of one line of Ollama's pull stream that this module reads. */
export interface PullEvent {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

/** Picks the known fields out of a parsed stream line, ignoring anything else. */
export function toPullEvent(value: unknown): PullEvent | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const event: PullEvent = {};
  if (typeof raw.status === 'string') event.status = raw.status;
  if (typeof raw.digest === 'string') event.digest = raw.digest;
  if (typeof raw.total === 'number') event.total = raw.total;
  if (typeof raw.completed === 'number') event.completed = raw.completed;
  if (typeof raw.error === 'string') event.error = raw.error;
  return event;
}

export interface ProgressTracker {
  /** Applies one stream line and returns the resulting overall progress. */
  update(event: PullEvent): PullProgress;
}

/**
 * Turns Ollama's per-part pull lines into overall progress. A model is several parts
 * (layers), each reporting its own `total` and `completed`; overall progress is the sum
 * over every part seen so far. Because parts are announced as the pull goes on, the
 * total can grow, so the fraction is not guaranteed to rise steadily.
 *
 * The phase comes from the shape of a line first (a part with byte counts is
 * downloading) and from its status text second. Status text this module does not
 * recognise leaves the phase unchanged, so a new wording in a future Ollama does not
 * break progress.
 */
export function createProgressTracker(): ProgressTracker {
  const parts = new Map<string, { total: number; completed: number }>();
  let phase: PullPhase = 'preparing';

  return {
    update(event) {
      const status = event.status?.toLowerCase() ?? '';
      if (
        event.digest !== undefined &&
        event.total !== undefined &&
        event.completed !== undefined
      ) {
        parts.set(event.digest, {
          total: event.total,
          completed: event.completed,
        });
        phase = 'downloading';
      } else if (status === 'success') {
        phase = 'done';
      } else if (status.startsWith('pulling manifest')) {
        phase = 'preparing';
      } else if (status.startsWith('verifying')) {
        phase = 'verifying';
      } else if (
        status.startsWith('writing') ||
        status.startsWith('removing')
      ) {
        phase = 'finishing';
      } else if (status.startsWith('pulling')) {
        phase = 'downloading';
      }

      let completedBytes = 0;
      let totalBytes = 0;
      for (const part of parts.values()) {
        completedBytes += part.completed;
        totalBytes += part.total;
      }
      const progress: PullProgress = { phase, completedBytes, totalBytes };
      if (totalBytes > 0)
        progress.fraction = Math.min(1, completedBytes / totalBytes);
      return progress;
    },
  };
}
