// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { installGuidance } from './guidance';
import type { Platform } from './types';

const STEPS = ['download', 'install', 'start', 'recheck'];

describe('installGuidance', () => {
  it.each<[Platform, string]>([
    ['windows', 'https://ollama.com/download/windows'],
    ['macos', 'https://ollama.com/download/mac'],
    ['linux', 'https://ollama.com/download/linux'],
    ['unknown', 'https://ollama.com/download'],
  ])('gives the official page for %s', (platform, url) => {
    expect(installGuidance(platform)).toEqual({
      downloadUrl: url,
      steps: STEPS,
    });
  });

  it('falls back to the general page for a platform it does not recognise', () => {
    const guidance = installGuidance('freebsd' as Platform);

    expect(guidance).toEqual({
      downloadUrl: 'https://ollama.com/download',
      steps: STEPS,
    });
  });

  it('defaults to the general page when no platform is given', () => {
    expect(installGuidance().downloadUrl).toBe('https://ollama.com/download');
  });

  it('contains no display wording, only step identifiers and an address', () => {
    const guidance = installGuidance('windows');

    expect(Object.keys(guidance).sort()).toEqual(['downloadUrl', 'steps']);
    expect(guidance.steps.every((step) => /^[a-z]+$/.test(step))).toBe(true);
  });

  it('returns a fresh steps list each time', () => {
    const first = installGuidance('linux');
    first.steps.push('extra' as never);

    expect(installGuidance('linux').steps).toEqual(STEPS);
  });
});
