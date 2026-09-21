// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cosineSimilarity, rankScores } from './similarity';

describe('cosineSimilarity', () => {
  it.each([
    ['the same direction', [1, 2, 3], [1, 2, 3], 1],
    ['the same direction at another length', [1, 2, 3], [10, 20, 30], 1],
    ['unrelated (orthogonal) vectors', [1, 0], [0, 1], 0],
    ['opposite vectors', [1, 2], [-1, -2], -1],
    ['a partly similar pair', [1, 1], [1, 0], Math.SQRT1_2],
  ])('scores %s', (_label, a, b, expected) => {
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 10);
  });

  it('gives 0 when either vector has no length', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('does not depend on the arguments being unit length', () => {
    expect(cosineSimilarity([3, 4], [6, 8])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([0.001, 0], [1000, 0])).toBeCloseTo(1, 10);
  });

  it('works on the Float32Arrays the vector store keeps', () => {
    const a = Float32Array.from([0.5, 0.25, -1]);
    const b = Float32Array.from([0.5, 0.25, -1]);

    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it('refuses vectors of different lengths', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(RangeError);
  });
});

describe('rankScores', () => {
  it('puts the highest score first and keeps each score with its position', () => {
    expect(rankScores([0.2, 0.9, 0.5, 0.7], 4)).toEqual([
      { index: 1, score: 0.9 },
      { index: 3, score: 0.7 },
      { index: 2, score: 0.5 },
      { index: 0, score: 0.2 },
    ]);
  });

  it('returns only the best `limit`', () => {
    expect(rankScores([0.2, 0.9, 0.5, 0.7], 2).map((r) => r.index)).toEqual([
      1, 3,
    ]);
  });

  it('returns everything, ranked, when the limit is above the number of scores', () => {
    expect(rankScores([0.1, 0.3], 10).map((r) => r.index)).toEqual([1, 0]);
  });

  it.each([0, -3])('returns nothing for a limit of %i', (limit) => {
    expect(rankScores([0.1, 0.3], limit)).toEqual([]);
  });

  it('returns nothing for no scores', () => {
    expect(rankScores([], 5)).toEqual([]);
  });

  it('lets the earlier item win a tie, however many there are', () => {
    const scores = [0.4, 0.8, 0.8, 0.4, 0.8, 0.1];

    expect(rankScores(scores, 6).map((r) => r.index)).toEqual([
      1, 2, 4, 0, 3, 5,
    ]);
  });

  it('ranks negative scores below zero and above worse ones', () => {
    expect(rankScores([-0.5, 0, -1, 0.2], 4).map((r) => r.index)).toEqual([
      3, 1, 0, 2,
    ]);
  });

  it('accepts typed arrays', () => {
    expect(
      rankScores(Float64Array.from([0.1, 0.5]), 1).map((r) => r.index),
    ).toEqual([1]);
  });

  it('does not change the scores it was given', () => {
    const scores = [0.3, 0.9, 0.1];

    rankScores(scores, 3);

    expect(scores).toEqual([0.3, 0.9, 0.1]);
  });
});
