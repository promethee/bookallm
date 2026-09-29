import { describe, expect, it } from 'vitest';
import { detectSystem, pickAssets } from './download.js';

const asset = (name) => ({
  name,
  browser_download_url: `https://github.com/promethee/bookallm/releases/download/v1.0.0/${name}`,
  size: 1000,
});

// The real v1.0.0 release's files.
const RELEASE = {
  assets: [
    'BookaLLM-1.0.0-1.x86_64.rpm',
    'BookaLLM_1.0.0_aarch64.dmg',
    'BookaLLM_1.0.0_amd64.AppImage',
    'BookaLLM_1.0.0_amd64.deb',
    'BookaLLM_1.0.0_x64-setup.exe',
    'BookaLLM_1.0.0_x64.dmg',
    'BookaLLM_1.0.0_x64_en-US.msi',
    'BookaLLM_aarch64.app.tar.gz',
    'BookaLLM_x64.app.tar.gz',
  ].map(asset),
};

describe('detectSystem', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Win32',
      'windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
      'MacIntel',
      'mac',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101', 'Linux x86_64', 'linux'],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'iPhone',
      'unknown',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
      'Linux armv8l',
      'unknown',
    ],
    ['', '', 'unknown'],
  ])('reads %j (%j) as %s', (userAgent, platform, system) => {
    expect(detectSystem(userAgent, platform)).toBe(system);
  });
});

describe('pickAssets', () => {
  it('offers the setup program on Windows, not the .msi', () => {
    expect(pickAssets(RELEASE, 'windows')).toEqual([
      expect.objectContaining({
        label: 'windows',
        name: 'BookaLLM_1.0.0_x64-setup.exe',
      }),
    ]);
  });

  it('offers both Mac installers, Apple chip first', () => {
    expect(pickAssets(RELEASE, 'mac').map((a) => [a.label, a.name])).toEqual([
      ['macArm', 'BookaLLM_1.0.0_aarch64.dmg'],
      ['macIntel', 'BookaLLM_1.0.0_x64.dmg'],
    ]);
  });

  it('offers the AppImage then the .deb on Linux', () => {
    expect(pickAssets(RELEASE, 'linux').map((a) => a.label)).toEqual([
      'linuxAppImage',
      'linuxDeb',
    ]);
  });

  it('offers nothing for an unknown system', () => {
    expect(pickAssets(RELEASE, 'unknown')).toEqual([]);
  });

  it('lists every installer for "all", in order', () => {
    expect(pickAssets(RELEASE, 'all').map((a) => a.label)).toEqual([
      'windows',
      'macArm',
      'macIntel',
      'linuxAppImage',
      'linuxDeb',
    ]);
  });

  it('leaves out an installer the release does not have', () => {
    const noIntel = {
      assets: RELEASE.assets.filter((a) => !a.name.endsWith('_x64.dmg')),
    };

    expect(pickAssets(noIntel, 'mac').map((a) => a.label)).toEqual(['macArm']);
  });

  it('copes with a missing or empty release', () => {
    expect(pickAssets(undefined, 'windows')).toEqual([]);
    expect(pickAssets({}, 'all')).toEqual([]);
  });

  it('keeps the download address and size', () => {
    const [windows] = pickAssets(RELEASE, 'windows');

    expect(windows.url).toBe(
      'https://github.com/promethee/bookallm/releases/download/v1.0.0/BookaLLM_1.0.0_x64-setup.exe',
    );
    expect(windows.size).toBe(1000);
  });
});
