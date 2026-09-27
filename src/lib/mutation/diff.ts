import {
  MUTATION_MAX_CHANGED_RUNS,
  MUTATION_MAX_CHANGED_SHARE,
  MUTATION_MIN_CHANGED_WORDS,
} from './defaults';
import type { ClaimChange, RejectReason } from './types';

/** Letters and digits only, lowercased: "Cunégonde." and "cunégonde" compare equal. */
const comparable = (word: string): string =>
  word.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

/** A run's words, without the punctuation at its two ends ("Cunégonde." → "Cunégonde"). */
const display = (words: readonly string[]): string =>
  words.join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * The runs of words that differ between `trueClaim` and `changedClaim`, found with a
 * longest common subsequence over words (compared ignoring case and punctuation). Each
 * run gives the true claim's words and the words that replaced them; either side is
 * empty for a pure insertion or deletion. Claims are one sentence, so the quadratic table
 * is trivially small.
 */
export function diffClaims(
  trueClaim: string,
  changedClaim: string,
): ClaimChange[] {
  const before = trueClaim.split(/\s+/).filter(Boolean);
  const after = changedClaim.split(/\s+/).filter(Boolean);
  const a = before.map(comparable);
  const b = after.map(comparable);

  // common[i][j]: length of the longest common subsequence of a[i..] and b[j..].
  const common = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i][j] =
        a[i] === b[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1]);

  const changes: ClaimChange[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const closeRun = () => {
    if (removed.length > 0 || added.length > 0)
      changes.push({ before: display(removed), after: display(added) });
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      closeRun();
      i++;
      j++;
    } else if (
      j >= b.length ||
      (i < a.length && common[i + 1][j] >= common[i][j + 1])
    ) {
      removed.push(before[i++]);
    } else {
      added.push(after[j++]);
    }
  }
  closeRun();
  // A run of punctuation only ("first." vs "first") is not a change a reader can see.
  return changes.filter((change) => change.before || change.after);
}

/**
 * Why `changes` (from `diffClaims`) is not an acceptable one-detail change of a claim of
 * `trueWordCount` words, or undefined when it is: nothing changed, too many separate
 * runs, or too many of the true claim's words changed.
 */
export function rejectChanges(
  changes: readonly ClaimChange[],
  trueWordCount: number,
): RejectReason | undefined {
  if (changes.length === 0) return 'nothing-changed';
  if (changes.length > MUTATION_MAX_CHANGED_RUNS) return 'changed-too-much';
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const changedWords = changes.reduce(
    (sum, change) => sum + Math.max(words(change.before), words(change.after)),
    0,
  );
  const limit = Math.max(
    MUTATION_MIN_CHANGED_WORDS,
    Math.floor(trueWordCount * MUTATION_MAX_CHANGED_SHARE),
  );
  return changedWords > limit ? 'changed-too-much' : undefined;
}
