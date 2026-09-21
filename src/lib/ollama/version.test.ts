// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion } from './version';

describe('parseVersion', () => {
  it('reads major, minor and patch', () => {
    expect(parseVersion('0.34.0')).toEqual([0, 34, 0]);
  });

  it('ignores a leading v', () => {
    expect(parseVersion('v0.3.4')).toEqual([0, 3, 4]);
  });

  it('ignores pre-release and build suffixes', () => {
    expect(parseVersion('0.3.4-rc1')).toEqual([0, 3, 4]);
    expect(parseVersion('0.34.3-rc1+abc')).toEqual([0, 34, 3]);
  });

  it('treats a missing patch as zero', () => {
    expect(parseVersion('1.2')).toEqual([1, 2, 0]);
  });

  it('rejects text that is not a version', () => {
    expect(parseVersion('unknown')).toBeUndefined();
    expect(parseVersion('')).toBeUndefined();
    expect(parseVersion('1')).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('reports equal versions as zero', () => {
    expect(compareVersions([0, 3, 4], [0, 3, 4])).toBe(0);
  });

  it('orders by major, then minor, then patch', () => {
    expect(compareVersions([0, 3, 3], [0, 3, 4])).toBeLessThan(0);
    expect(compareVersions([0, 4, 0], [0, 3, 9])).toBeGreaterThan(0);
    expect(compareVersions([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0);
  });

  it('compares numbers, not text', () => {
    expect(compareVersions([0, 10, 0], [0, 9, 0])).toBeGreaterThan(0);
  });

  it('treats a pre-release like its release once the suffix is ignored', () => {
    expect(
      compareVersions(parseVersion('0.3.4-rc1')!, parseVersion('0.3.4')!),
    ).toBe(0);
  });
});
