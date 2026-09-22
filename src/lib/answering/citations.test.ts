// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ChunkLocator } from '../ingest/types';
import { parseCitations } from './citations';
import type { OfferedPassage } from './types';

const locator = (n: number): ChunkLocator => ({
  chapterNumber: n,
  chapterTitle: `Chapter ${n}`,
  paragraphStart: 0,
  paragraphEnd: 0,
  charStart: 0,
  charEnd: 10,
});

const passages = (count: number): OfferedPassage[] =>
  Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    text: `passage ${i + 1}`,
    locator: locator(i + 1),
    chunkId: `chunk-${i + 1}`,
  }));

describe('parseCitations', () => {
  it('resolves a single marker to its passage', () => {
    const citations = parseCitations('She agreed[1].', passages(2));

    expect(citations).toEqual([
      {
        passageIndex: 1,
        chunkId: 'chunk-1',
        locator: locator(1),
        offset: 10,
      },
    ]);
  });

  it('resolves several separate markers, each to its own passage', () => {
    const citations = parseCitations(
      'First claim[1]. Second claim[2].',
      passages(2),
    );

    expect(citations.map((c) => c.passageIndex)).toEqual([1, 2]);
    expect(citations[0].offset).toBe(11);
    expect(citations[1].offset).toBe(28);
  });

  it('resolves a marker citing several passages into one citation per number', () => {
    const citations = parseCitations('A shared claim[1, 3].', passages(3));

    expect(citations).toHaveLength(2);
    expect(citations.map((c) => c.passageIndex)).toEqual([1, 3]);
    expect(citations[0].offset).toBe(citations[1].offset);
  });

  it('accepts a marker without a space after the comma', () => {
    const citations = parseCitations('claim[1,2]', passages(2));

    expect(citations.map((c) => c.passageIndex)).toEqual([1, 2]);
  });

  it('drops a number that does not match any offered passage', () => {
    const citations = parseCitations('claim[5]', passages(2));

    expect(citations).toEqual([]);
  });

  it('drops only the invalid numbers in a mixed marker', () => {
    const citations = parseCitations('claim[1, 9]', passages(2));

    expect(citations.map((c) => c.passageIndex)).toEqual([1]);
  });

  it('is empty for text with no markers', () => {
    expect(parseCitations('No citations here.', passages(2))).toEqual([]);
  });

  it('is empty when no passages were offered', () => {
    expect(parseCitations('claim[1]', [])).toEqual([]);
  });

  it.each([
    ['unbracketed', 'claim 1'],
    ['no digits', 'claim[]'],
    ['a letter instead of a number', 'claim[a]'],
    ['an unclosed bracket', 'claim[1'],
  ])('ignores a malformed marker (%s)', (_label, text) => {
    expect(parseCitations(text, passages(2))).toEqual([]);
  });

  it('finds a marker at the very start of the text', () => {
    expect(parseCitations('[1]Leading.', passages(1))).toEqual([
      { passageIndex: 1, chunkId: 'chunk-1', locator: locator(1), offset: 0 },
    ]);
  });

  it('finds a marker at the very end of the text', () => {
    const citations = parseCitations('Trailing.[1]', passages(1));

    expect(citations).toEqual([
      { passageIndex: 1, chunkId: 'chunk-1', locator: locator(1), offset: 9 },
    ]);
  });

  it('finds every marker even when the same passage is cited twice', () => {
    const citations = parseCitations('claim[1]. again[1].', passages(1));

    expect(citations).toHaveLength(2);
    expect(citations.every((c) => c.passageIndex === 1)).toBe(true);
    expect(citations[0].offset).not.toBe(citations[1].offset);
  });
});
