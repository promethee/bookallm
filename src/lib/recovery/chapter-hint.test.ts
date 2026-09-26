import { describe, expect, it } from 'vitest';
import {
  findChapterReference,
  matchChapterByTitle,
  parseRoman,
} from './chapter-hint';

describe('parseRoman', () => {
  it.each([
    ['I', 1],
    ['iv', 4],
    ['VII', 7],
    ['XIX', 19],
    ['XL', 40],
    ['XC', 90],
    ['CXXXV', 135],
    ['CCCXCIX', 399],
  ])('reads %s as %i', (numeral, value) => {
    expect(parseRoman(numeral)).toBe(value);
  });

  it.each(['', 'IIII', 'VX', 'IC', 'civil', 'CD', 'M'])(
    'rejects %j',
    (numeral) => {
      expect(parseRoman(numeral)).toBeUndefined();
    },
  );
});

describe('findChapterReference', () => {
  it.each([
    ['try chapter 7', 7],
    ['Chapter 12 maybe?', 12],
    ['CHAPTER VII', 7],
    ['regarde au chapitre VII', 7],
    ['chapitre 3, je crois', 3],
    ['in ch. 4', 4],
    ['ch.4', 4],
    ['chap. xii', 12],
    ['chapitre n° 5', 5],
    ['chapter no. 9', 9],
    ['chapter 135', 135],
  ])('reads %j as chapter %i', (message, value) => {
    expect(findChapterReference(message)).toBe(value);
  });

  it.each([
    'try 7',
    'chapter seven',
    'le septième chapitre',
    'what is a chapter?',
    'a chapter civil war',
    'chapter 0',
    'the chapters',
    'mychapter 7',
    'chapter 7b',
  ])('finds no chapter in %j', (message) => {
    expect(findChapterReference(message)).toBeUndefined();
  });

  it('uses the first chapter named', () => {
    expect(findChapterReference('chapter 3 or chapter 4')).toBe(3);
  });
});

const chapter = (number: number, title: string, text = 'Some text.') => ({
  number,
  title,
  text,
});

describe('matchChapterByTitle', () => {
  it('matches the title that names the chapter, not the position', () => {
    const chapters = [
      chapter(1, 'Introduction'),
      chapter(2, 'Chapter 1'),
      chapter(3, 'Chapter 2'),
    ];

    expect(matchChapterByTitle(chapters, 2)).toEqual([chapters[2]]);
  });

  it('reads Roman numerals and French titles', () => {
    const chapters = [
      chapter(1, 'CHAPTER VI. The ball'),
      chapter(2, 'Chapitre VII : Le bal'),
    ];

    expect(matchChapterByTitle(chapters, 7)).toEqual([chapters[1]]);
  });

  it('matches whole numbers only', () => {
    const chapters = [
      chapter(1, 'Chapter 17'),
      chapter(2, 'CHAPTER VIII'),
      chapter(3, 'Chapter 7'),
    ];

    expect(matchChapterByTitle(chapters, 7)).toEqual([chapters[2]]);
  });

  it.each(['VII. The ball', '7 - Le bal', 'VII', '7: Title', '7) Title'])(
    'matches a title that starts with its number: %j',
    (title) => {
      expect(matchChapterByTitle([chapter(9, title)], 7)).toHaveLength(1);
    },
  );

  it('does not read the word "I" at the start of a title as chapter one', () => {
    expect(matchChapterByTitle([chapter(1, 'I Meet Him')], 1)).toEqual([]);
  });

  it('reads a lone "I" followed by punctuation as chapter one', () => {
    expect(matchChapterByTitle([chapter(1, 'I. Beginnings')], 1)).toHaveLength(
      1,
    );
  });

  it('leaves out chapters without text', () => {
    const chapters = [
      chapter(1, 'Chapter 3', '  '),
      chapter(2, 'Chapter 3 (continued)'),
    ];

    expect(matchChapterByTitle(chapters, 3)).toEqual([chapters[1]]);
  });

  it('returns nothing when no title carries a number', () => {
    const chapters = [
      chapter(1, 'ADVENTURES OF THE TWO TRAVELLERS'),
      chapter(2, 'WHAT HAPPENED IN FRANCE'),
    ];

    expect(matchChapterByTitle(chapters, 1)).toEqual([]);
  });

  it('returns every chapter that matches', () => {
    const chapters = [
      chapter(1, 'Part One, Chapter 1'),
      chapter(2, 'Part Two, Chapter 1'),
    ];

    expect(matchChapterByTitle(chapters, 1)).toHaveLength(2);
  });
});
