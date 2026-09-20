// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { openEpub } from './open';
import {
  buildEpub,
  type BuildEpubOptions,
  type TocEntry as BuiltTocEntry,
} from './testing/epub-builder';
import { readToc } from './toc';

const documents = [
  { href: 'a.xhtml', body: '<p>A</p>' },
  { href: 'text/b.xhtml', body: '<p>B</p>' },
];

const nestedToc: BuiltTocEntry[] = [
  {
    title: 'Part I',
    href: 'a.xhtml',
    children: [
      { title: 'Chapter 1', href: 'a.xhtml#c1' },
      { title: 'Chapter 2', href: 'text/b.xhtml' },
    ],
  },
  { title: 'Epilogue', href: 'text/b.xhtml#end' },
];

function tocOf(options: Partial<BuildEpubOptions>) {
  const opened = openEpub(buildEpub({ documents, ...options }));
  if (!opened.ok) throw new Error(`open failed: ${opened.error.code}`);
  return readToc(opened.value.files, opened.value.info);
}

const expected = [
  { title: 'Part I', path: 'OEBPS/a.xhtml' },
  { title: 'Chapter 1', path: 'OEBPS/a.xhtml', fragment: 'c1' },
  { title: 'Chapter 2', path: 'OEBPS/text/b.xhtml' },
  { title: 'Epilogue', path: 'OEBPS/text/b.xhtml', fragment: 'end' },
];

describe('readToc', () => {
  it('flattens a nested EPUB 3 navigation document in order', () => {
    expect(tocOf({ version: 3, toc: nestedToc })).toEqual(expected);
  });

  it('flattens a nested EPUB 2 NCX in order', () => {
    expect(tocOf({ version: 2, toc: nestedToc })).toEqual(expected);
  });

  it('resolves entry paths relative to the navigation file', () => {
    const entries = tocOf({
      toc: [{ title: 'B', href: 'text/b.xhtml' }],
    });

    expect(entries).toEqual([{ title: 'B', path: 'OEBPS/text/b.xhtml' }]);
  });

  it('drops entries that point outside the reading order', () => {
    const entries = tocOf({
      toc: [
        { title: 'Real', href: 'a.xhtml' },
        { title: 'Ghost', href: 'missing.xhtml' },
      ],
    });

    expect(entries.map((e) => e.title)).toEqual(['Real']);
  });

  it('returns nothing when there is no navigation file', () => {
    expect(tocOf({ toc: null })).toEqual([]);
  });

  it('returns nothing for an empty navigation list', () => {
    expect(tocOf({ toc: [] })).toEqual([]);
  });
});
