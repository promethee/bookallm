// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InMemoryRegistry, normalizeForMatch } from './registry';
import { runRegistryContract } from './testing/registry-contract';

runRegistryContract('in-memory', () => new InMemoryRegistry());

describe('normalizeForMatch', () => {
  it('ignores case and collapses whitespace', () => {
    expect(normalizeForMatch('  Le   Petit\tPrince ')).toBe('le petit prince');
  });

  it('treats composed and decomposed accents as the same', () => {
    expect(normalizeForMatch('Crème')).toBe(normalizeForMatch('Crème'));
  });

  it('returns an empty string for whitespace only', () => {
    expect(normalizeForMatch(' \n ')).toBe('');
  });
});
