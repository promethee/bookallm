import { readText, type EpubFiles } from './archive';
import type { PackageInfo } from './package';
import { resolveHref } from './paths';
import {
  attr,
  elementsByLocalName,
  elementsByTag,
  parseHtml,
  parseXml,
  textOf,
} from './xml';

/** One table-of-contents entry, pointing at a spine document and optional fragment. */
export interface TocEntry {
  title: string;
  /** Archive path of the target content document. */
  path: string;
  fragment?: string;
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** EPUB 3: every link in the `toc` navigation, so nesting flattens in document order. */
function readNav(files: EpubFiles, navPath: string): TocEntry[] {
  const text = readText(files, navPath);
  if (text === undefined) return [];
  const doc = parseHtml(text);
  const navs = elementsByTag('nav', doc);
  const toc =
    navs.find((nav) =>
      (attr(nav, 'epub:type') ?? '').split(/\s+/).includes('toc'),
    ) ?? navs[0];
  if (!toc) return [];

  const entries: TocEntry[] = [];
  for (const link of elementsByTag('a', toc)) {
    const href = attr(link, 'href');
    if (!href) continue;
    entries.push({
      title: collapse(textOf(link)),
      ...resolveHref(navPath, href),
    });
  }
  return entries;
}

/** EPUB 2: every `navPoint` of the NCX, depth-first so nesting flattens in order. */
function readNcx(files: EpubFiles, ncxPath: string): TocEntry[] {
  const text = readText(files, ncxPath);
  if (text === undefined) return [];
  const entries: TocEntry[] = [];
  for (const point of elementsByLocalName('navPoint', parseXml(text))) {
    // The first label and content in document order are the point's own, not a child's.
    const label = elementsByLocalName('navLabel', point)[0];
    const content = elementsByLocalName('content', point)[0];
    const src = content && attr(content, 'src');
    if (!src) continue;
    entries.push({
      title: label ? collapse(textOf(label)) : '',
      ...resolveHref(ncxPath, src),
    });
  }
  return entries;
}

/**
 * The book's table of contents as a flat, ordered list of entries that point into the
 * reading order. Prefers the EPUB 3 navigation document, then the EPUB 2 NCX. Entries
 * pointing outside the reading order are dropped. Empty when there is no usable TOC.
 */
export function readToc(files: EpubFiles, info: PackageInfo): TocEntry[] {
  const spine = new Set(info.spine);
  const inSpine = (entries: TocEntry[]): TocEntry[] =>
    entries.filter((entry) => spine.has(entry.path));

  const fromNav = info.navPath ? inSpine(readNav(files, info.navPath)) : [];
  if (fromNav.length > 0) return fromNav;
  return info.ncxPath ? inSpine(readNcx(files, info.ncxPath)) : [];
}
