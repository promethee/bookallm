import { readText, type EpubFiles } from './archive';
import type { PackageInfo } from './package';
import { fail, ok, type Result } from './result';
import { extractDocument } from './text';
import { readToc } from './toc';
import type { Chapter } from './types';

const PARAGRAPH_SEPARATOR = '\n\n';

/** File name without folders or extension, used when a document offers no better title. */
const baseName = (path: string): string =>
  (path.split('/').pop() ?? path).replace(/\.[^.]+$/, '');

/**
 * Builds the chapter list from the reading order and table of contents.
 *
 * Chapters follow the TOC in reading order. A chapter runs from its entry's position
 * (document plus optional fragment) to the next entry's position, so text in documents
 * no entry references extends the preceding chapter. Text before the first entry
 * becomes a leading chapter. When two entries share a position the earlier one is
 * empty. With no usable TOC every spine document is one chapter. Chapters without text
 * are kept so numbering stays stable. Fails with `no-text-content` if no chapter has
 * any text.
 */
export function assembleChapters(
  files: EpubFiles,
  info: PackageInfo,
): Result<Chapter[]> {
  const documents = info.spine.map((path) =>
    extractDocument(readText(files, path) ?? ''),
  );

  // Positions are indexes into one paragraph list spanning the whole reading order.
  const documentStart: number[] = [];
  const paragraphs: string[] = [];
  for (const document of documents) {
    documentStart.push(paragraphs.length);
    paragraphs.push(...document.paragraphs);
  }

  const chapters: Chapter[] = [];
  const addChapter = (title: string, from: number, to: number): void => {
    chapters.push({
      number: chapters.length + 1,
      title,
      text: paragraphs.slice(from, to).join(PARAGRAPH_SEPARATOR),
    });
  };

  const toc = readToc(files, info);
  if (toc.length === 0) {
    documents.forEach((document, i) => {
      addChapter(
        document.heading ?? baseName(info.spine[i]),
        documentStart[i],
        documentStart[i] + document.paragraphs.length,
      );
    });
  } else {
    const entries = toc
      .map((entry, order) => {
        const index = info.spine.indexOf(entry.path);
        const inDocument =
          entry.fragment === undefined
            ? 0
            : (documents[index].anchors.get(entry.fragment) ?? 0);
        return { entry, order, start: documentStart[index] + inDocument };
      })
      // Keep chapters in reading order even if the TOC lists them out of order.
      .sort((a, b) => a.start - b.start || a.order - b.order);

    if (entries[0].start > 0) {
      // Only trust the first document's heading if it lies within the leading text.
      const first = documents[0];
      const headingIsLeading =
        first.headingIndex !== undefined &&
        first.headingIndex < entries[0].start;
      addChapter(
        headingIsLeading && first.heading
          ? first.heading
          : baseName(info.spine[0]),
        0,
        entries[0].start,
      );
    }
    entries.forEach(({ entry, start }, i) => {
      const end =
        i + 1 < entries.length ? entries[i + 1].start : paragraphs.length;
      addChapter(entry.title || baseName(entry.path), start, end);
    });
  }

  if (chapters.every((chapter) => chapter.text === '')) {
    return fail('no-text-content');
  }
  return ok(chapters);
}
