/**
 * Cosine similarity of two vectors of the same length: 1 for the same direction, 0 for
 * unrelated, -1 for opposite. It divides by both lengths, so it does not rely on a model
 * having normalised its output. A vector with no length (all zeros) scores 0 against
 * everything.
 */
export function cosineSimilarity(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): number {
  if (a.length !== b.length)
    throw new RangeError('Vectors of different lengths cannot be compared');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RankedScore {
  /** Position in the list of scores that was ranked. */
  index: number;
  score: number;
}

/**
 * The best `limit` scores with their positions, highest first. Equal scores keep the
 * order they had, so the earlier item wins a tie and the ranking never depends on how
 * the sort happens to behave. A limit above the number of scores returns them all.
 */
export function rankScores(
  scores: ArrayLike<number>,
  limit: number,
): RankedScore[] {
  const ranked: RankedScore[] = Array.from(
    { length: scores.length },
    (_, index) => ({ index, score: scores[index] }),
  );
  ranked.sort((x, y) => y.score - x.score || x.index - y.index);
  return ranked.slice(0, Math.max(0, Math.floor(limit)));
}
