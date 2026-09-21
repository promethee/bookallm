// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ESTIMATE_MIN_CHUNKS,
  estimateRemainingMs,
  roundRemaining,
  updatePace,
  type Pace,
} from './estimate';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('updatePace', () => {
  it('starts from the chunks already done when the run begins', () => {
    expect(updatePace(undefined, 300, 0)).toEqual({ startChunks: 300 });
  });

  it('marks the moment the first batch came back, once', () => {
    let pace = updatePace(undefined, 0, 0);
    pace = updatePace(pace, 0, 5 * SECOND);
    expect(pace).toEqual({ startChunks: 0 });

    pace = updatePace(pace, 4, 20 * SECOND);
    pace = updatePace(pace, 8, 40 * SECOND);

    expect(pace).toEqual({ startChunks: 0, first: { chunks: 4, at: 20_000 } });
  });

  it('starts again when the index starts again from a lower count', () => {
    let pace = updatePace(undefined, 6, 0);
    pace = updatePace(pace, 10, 10 * SECOND);

    expect(updatePace(pace, 0, 20 * SECOND)).toEqual({ startChunks: 0 });
  });
});

describe('estimateRemainingMs', () => {
  const pace: Pace = { startChunks: 0, first: { chunks: 4, at: 60 * SECOND } };

  it('says nothing before the first batch is in', () => {
    expect(estimateRemainingMs({ startChunks: 0 }, 0, 100, 10 * SECOND)).toBe(
      undefined,
    );
  });

  it.each([1, 4, 7])('says nothing with only %i chunks done', (done) => {
    expect(estimateRemainingMs(pace, done, 100, 200 * SECOND)).toBe(undefined);
  });

  it('gives an estimate once 8 chunks are done, from the pace after the first batch', () => {
    expect(ESTIMATE_MIN_CHUNKS).toBe(8);

    // 4 more chunks took 120 s, so 30 s a chunk; 92 chunks are left.
    expect(estimateRemainingMs(pace, 8, 100, 180 * SECOND)).toBe(
      92 * 30 * SECOND,
    );
  });

  it('ignores the slow first batch (the model loading)', () => {
    // The first batch took 60 s to arrive, but every batch after took 4 s.
    const quick: Pace = {
      startChunks: 0,
      first: { chunks: 4, at: 60 * SECOND },
    };

    expect(estimateRemainingMs(quick, 12, 100, 68 * SECOND)).toBe(
      88 * 1 * SECOND,
    );
  });

  it('counts only this run for a resumed index', () => {
    const resumed: Pace = {
      startChunks: 300,
      first: { chunks: 304, at: 10 * SECOND },
    };

    expect(estimateRemainingMs(resumed, 307, 657, 100 * SECOND)).toBe(
      undefined,
    );
    // 308 - 300 = 8 chunks this run; 4 chunks in 30 s; 349 chunks left.
    expect(estimateRemainingMs(resumed, 308, 657, 40 * SECOND)).toBe(
      (349 * 30 * SECOND) / 4,
    );
  });

  it.each([
    ['no time has passed', 8, 60 * SECOND],
    ['no chunk was done since the first batch', 4, 200 * SECOND],
  ])('says nothing when %s', (_label, done, now) => {
    const stalled: Pace = {
      startChunks: -4,
      first: { chunks: 4, at: 60 * SECOND },
    };

    expect(estimateRemainingMs(stalled, done, 100, now)).toBe(undefined);
  });

  it('is zero once every chunk is done', () => {
    expect(estimateRemainingMs(pace, 100, 100, 999 * SECOND)).toBe(0);
  });
});

describe('roundRemaining', () => {
  it.each([
    [0, { kind: 'under-a-minute' }],
    [30 * SECOND, { kind: 'under-a-minute' }],
    [44_999, { kind: 'under-a-minute' }],
    [45 * SECOND, { kind: 'about', minutes: 1 }],
    [4 * MINUTE + 20 * SECOND, { kind: 'about', minutes: 4 }],
    [9 * MINUTE + 40 * SECOND, { kind: 'about', minutes: 10 }],
    [12 * MINUTE, { kind: 'about', minutes: 10 }],
    [13 * MINUTE, { kind: 'about', minutes: 15 }],
    [47 * MINUTE, { kind: 'about', minutes: 45 }],
    [59 * MINUTE, { kind: 'about', minutes: 60 }],
    [67 * MINUTE, { kind: 'about', minutes: 60 }],
    [68 * MINUTE, { kind: 'about', minutes: 75 }],
    [272 * MINUTE, { kind: 'about', minutes: 270 }],
  ])('rounds %i ms to %j', (ms, expected) => {
    expect(roundRemaining(ms)).toEqual(expected);
  });
});
