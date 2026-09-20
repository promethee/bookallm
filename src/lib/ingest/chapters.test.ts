// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assembleChapters } from './chapters';
import { openEpub } from './open';
import { buildEpub, type BuildEpubOptions } from './testing/epub-builder';

function chaptersOf(options: BuildEpubOptions) {
  const opened = openEpub(buildEpub(options));
  if (!opened.ok) throw new Error(`open failed: ${opened.error.code}`);
  return assembleChapters(opened.value.files, opened.value.info);
}

function summary(options: BuildEpubOptions) {
  const result = chaptersOf(options);
  if (!result.ok) throw new Error(`assemble failed: ${result.error.code}`);
  return result.value.map(({ number, title, text }) => ({
    number,
    title,
    text,
  }));
}

describe('assembleChapters with a table of contents', () => {
  it('makes one chapter per entry, in order, with the entry titles', () => {
    const chapters = summary({
      documents: [
        { href: 'a.xhtml', body: '<h1>One</h1><p>First.</p>' },
        { href: 'b.xhtml', body: '<h1>Two</h1><p>Second.</p>' },
      ],
      toc: [
        { title: 'Chapter One', href: 'a.xhtml' },
        { title: 'Chapter Two', href: 'b.xhtml' },
      ],
    });

    expect(chapters).toEqual([
      { number: 1, title: 'Chapter One', text: 'One\n\nFirst.' },
      { number: 2, title: 'Chapter Two', text: 'Two\n\nSecond.' },
    ]);
  });

  it('splits one document at fragment entries', () => {
    const chapters = summary({
      documents: [
        {
          href: 'a.xhtml',
          body:
            '<p>Prologue words.</p><h2 id="s1">Alpha</h2><p>Alpha body.</p>' +
            '<h2 id="s2">Beta</h2><p>Beta body.</p>',
        },
      ],
      toc: [
        { title: 'Alpha', href: 'a.xhtml#s1' },
        { title: 'Beta', href: 'a.xhtml#s2' },
      ],
    });

    expect(chapters.map((c) => c.text)).toEqual([
      'Prologue words.',
      'Alpha\n\nAlpha body.',
      'Beta\n\nBeta body.',
    ]);
    expect(chapters.map((c) => c.title)).toEqual(['a', 'Alpha', 'Beta']);
  });

  it('extends a chapter over documents that no entry references', () => {
    const chapters = summary({
      documents: [
        { href: 'a.xhtml', body: '<p>A1</p>' },
        { href: 'a2.xhtml', body: '<p>A2</p>' },
        { href: 'b.xhtml', body: '<p>B1</p>' },
      ],
      toc: [
        { title: 'A', href: 'a.xhtml' },
        { title: 'B', href: 'b.xhtml' },
      ],
    });

    expect(chapters).toEqual([
      { number: 1, title: 'A', text: 'A1\n\nA2' },
      { number: 2, title: 'B', text: 'B1' },
    ]);
  });

  it('turns text before the first entry into a leading chapter', () => {
    const chapters = summary({
      documents: [
        { href: 'front.xhtml', body: '<h1>Title Page</h1><p>By someone.</p>' },
        { href: 'a.xhtml', body: '<p>Body.</p>' },
      ],
      toc: [{ title: 'Chapter 1', href: 'a.xhtml' }],
    });

    expect(chapters).toEqual([
      { number: 1, title: 'Title Page', text: 'Title Page\n\nBy someone.' },
      { number: 2, title: 'Chapter 1', text: 'Body.' },
    ]);
  });

  it('keeps a chapter with no text so later chapters keep their numbers', () => {
    const chapters = summary({
      documents: [
        { href: 'a.xhtml', body: '<p>A</p>' },
        {
          href: 'plate.xhtml',
          body: '<div><img src="plate.jpg" alt=""/></div>',
        },
        { href: 'c.xhtml', body: '<p>C</p>' },
      ],
      toc: [
        { title: 'A', href: 'a.xhtml' },
        { title: 'Plate', href: 'plate.xhtml' },
        { title: 'C', href: 'c.xhtml' },
      ],
    });

    expect(chapters).toEqual([
      { number: 1, title: 'A', text: 'A' },
      { number: 2, title: 'Plate', text: '' },
      { number: 3, title: 'C', text: 'C' },
    ]);
  });

  it('gives the text to the later entry when two entries share a position', () => {
    const chapters = summary({
      documents: [{ href: 'a.xhtml', body: '<p>Text.</p>' }],
      toc: [
        { title: 'Part I', href: 'a.xhtml' },
        { title: 'Chapter 1', href: 'a.xhtml' },
      ],
    });

    expect(chapters).toEqual([
      { number: 1, title: 'Part I', text: '' },
      { number: 2, title: 'Chapter 1', text: 'Text.' },
    ]);
  });

  it('falls back to the document start when a fragment is not found', () => {
    const chapters = summary({
      documents: [{ href: 'a.xhtml', body: '<p>Text.</p>' }],
      toc: [{ title: 'Lost', href: 'a.xhtml#nope' }],
    });

    expect(chapters).toEqual([{ number: 1, title: 'Lost', text: 'Text.' }]);
  });

  it('works for EPUB 2 navigation too', () => {
    const chapters = summary({
      version: 2,
      documents: [
        { href: 'a.xhtml', body: '<p>A</p>' },
        { href: 'b.xhtml', body: '<p>B</p>' },
      ],
      toc: [
        { title: 'One', href: 'a.xhtml' },
        { title: 'Two', href: 'b.xhtml' },
      ],
    });

    expect(chapters.map((c) => [c.title, c.text])).toEqual([
      ['One', 'A'],
      ['Two', 'B'],
    ]);
  });
});

describe('assembleChapters without a table of contents', () => {
  it('makes one chapter per document, titled from its first heading', () => {
    const chapters = summary({
      documents: [
        { href: 'a.xhtml', body: '<h1>Opening</h1><p>Words.</p>' },
        { href: 'b.xhtml', body: '<h2>Middle</h2><p>More.</p>' },
      ],
      toc: null,
    });

    expect(chapters.map((c) => c.title)).toEqual(['Opening', 'Middle']);
  });

  it('falls back to the file name when a document has no heading', () => {
    const chapters = summary({
      documents: [{ href: 'text/part-one.xhtml', body: '<p>Words.</p>' }],
      toc: null,
    });

    expect(chapters).toEqual([
      { number: 1, title: 'part-one', text: 'Words.' },
    ]);
  });

  it('treats an empty table of contents like a missing one', () => {
    const chapters = summary({
      documents: [{ href: 'a.xhtml', body: '<h1>Only</h1><p>Words.</p>' }],
      toc: [],
    });

    expect(chapters.map((c) => c.title)).toEqual(['Only']);
  });
});

describe('assembleChapters text content', () => {
  it('fails with no-text-content for an image-only book', () => {
    const result = chaptersOf({
      documents: [
        { href: 'a.xhtml', body: '<div><img src="1.jpg" alt=""/></div>' },
        { href: 'b.xhtml', body: '<div><img src="2.jpg" alt=""/></div>' },
      ],
      toc: [{ title: 'Page', href: 'a.xhtml' }],
    });

    expect(result).toEqual({ ok: false, error: { code: 'no-text-content' } });
  });

  it('gives identical chapters for identical input', () => {
    const options: BuildEpubOptions = {
      documents: [{ href: 'a.xhtml', body: '<h1>A</h1><p>B &amp; C</p>' }],
      toc: [{ title: 'A', href: 'a.xhtml' }],
    };

    expect(chaptersOf(options)).toEqual(chaptersOf(options));
  });
});
