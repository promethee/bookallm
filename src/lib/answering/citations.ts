import { CITATION_PATTERN } from './defaults';
import type { Citation, OfferedPassage } from './types';

/**
 * Turns every `[n]` / `[n, m]` marker in `text` into citations, in the order the markers
 * appear. A number that does not match any offered passage produces no citation for that
 * number; the rest of the marker (and the rest of the text) is unaffected. A marker with
 * several numbers produces one citation per valid number, at the same offset.
 */
export function parseCitations(
  text: string,
  passages: readonly OfferedPassage[],
): Citation[] {
  const byIndex = new Map(passages.map((passage) => [passage.index, passage]));
  const citations: Citation[] = [];

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const offset = match.index;
    const numbers = match[1].split(',').map((part) => Number(part.trim()));
    for (const number of numbers) {
      const passage = byIndex.get(number);
      if (!passage) continue;
      citations.push({
        passageIndex: passage.index,
        chunkId: passage.chunkId,
        locator: passage.locator,
        offset,
      });
    }
  }
  return citations;
}
