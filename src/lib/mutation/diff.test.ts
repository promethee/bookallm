import { describe, expect, it } from 'vitest';
import { diffClaims, rejectChanges } from './diff';

const TRUE_CLAIM =
  'Candide was driven out because the Baron caught him kissing Cunégonde.';
const words = (text: string) => text.split(/\s+/).length;

describe('diffClaims', () => {
  it('finds a one-word swap, without the trailing punctuation', () => {
    expect(
      diffClaims(
        TRUE_CLAIM,
        'Candide was driven out because the Baron caught him kissing Paquette.',
      ),
    ).toEqual([{ before: 'Cunégonde', after: 'Paquette' }]);
  });

  it('finds a multi-word swap as one run', () => {
    expect(
      diffClaims(
        'The Bulgarians destroyed the castle after Candide was driven out.',
        'The Bulgarians destroyed the castle long before Candide was driven out.',
      ),
    ).toEqual([{ before: 'after', after: 'long before' }]);
  });

  it('reports an insertion and a deletion with an empty side', () => {
    expect(
      diffClaims(
        'The old woman showed Candide a suit.',
        'The old woman showed Candide a suit in Lisbon.',
      ),
    ).toEqual([{ before: '', after: 'in Lisbon' }]);
    expect(
      diffClaims(
        'The old woman showed Candide a suit.',
        'The woman showed Candide a suit.',
      ),
    ).toEqual([{ before: 'old', after: '' }]);
  });

  it('ignores case and punctuation', () => {
    expect(
      diffClaims('Candide left, weeping.', 'candide left weeping'),
    ).toEqual([]);
  });

  it('finds nothing between identical claims', () => {
    expect(diffClaims(TRUE_CLAIM, TRUE_CLAIM)).toEqual([]);
  });

  it('finds two separate runs', () => {
    expect(
      diffClaims(
        'Martin met Candide in Surinam.',
        'Cacambo met Candide in Venice.',
      ),
    ).toEqual([
      { before: 'Martin', after: 'Cacambo' },
      { before: 'Surinam', after: 'Venice' },
    ]);
  });
});

describe('rejectChanges', () => {
  it('rejects no change as nothing-changed', () => {
    expect(rejectChanges([], 10)).toBe('nothing-changed');
  });

  it('accepts one or two runs within the limits', () => {
    expect(rejectChanges([{ before: 'a', after: 'b' }], 10)).toBeUndefined();
    expect(
      rejectChanges(
        [
          { before: 'a', after: 'b' },
          { before: 'c', after: 'd' },
        ],
        10,
      ),
    ).toBeUndefined();
  });

  it('rejects three runs as changed-too-much', () => {
    expect(
      rejectChanges(
        [
          { before: 'a', after: 'b' },
          { before: 'c', after: 'd' },
          { before: 'e', after: 'f' },
        ],
        20,
      ),
    ).toBe('changed-too-much');
  });

  it('rejects changing more than half of the claim', () => {
    const rewritten = diffClaims(
      TRUE_CLAIM,
      'Candide fled the castle at night after a quarrel with Pangloss.',
    );

    expect(rejectChanges(rewritten, words(TRUE_CLAIM))).toBe(
      'changed-too-much',
    );
  });

  it('lets a short claim change up to three words', () => {
    expect(
      rejectChanges([{ before: 'Martin', after: 'the old woman' }], 4),
    ).toBeUndefined();
    expect(
      rejectChanges([{ before: 'Martin', after: 'the old wise woman' }], 4),
    ).toBe('changed-too-much');
  });
});
