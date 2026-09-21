// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { detectPlatform, isOfficialOllamaUrl, openExternal } from './platform';

describe('detectPlatform', () => {
  it.each([
    [{ userAgentDataPlatform: 'Windows' }, 'windows'],
    [
      {
        platform: 'Win32',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      'windows',
    ],
    [
      {
        platform: 'MacIntel',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
      },
      'macos',
    ],
    [{ userAgentDataPlatform: 'macOS' }, 'macos'],
    [
      {
        platform: 'Linux x86_64',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
      },
      'linux',
    ],
    [{ platform: 'FreeBSD' }, 'unknown'],
    [{}, 'unknown'],
  ] as const)('reads %j as %s', (info, expected) => {
    expect(detectPlatform(info)).toBe(expected);
  });

  it('does not mistake darwin for windows', () => {
    expect(detectPlatform({ platform: 'darwin' })).toBe('macos');
  });
});

describe('isOfficialOllamaUrl', () => {
  it.each([
    'https://ollama.com/download',
    'https://ollama.com/download/windows',
    'https://ollama.com/download/mac',
    'https://ollama.com',
    'HTTPS://OLLAMA.COM/download',
  ])('allows %s', (url) => {
    expect(isOfficialOllamaUrl(url)).toBe(true);
  });

  it.each([
    'http://ollama.com/download',
    'https://ollama.com.evil.test/download',
    'https://evil.test/ollama.com',
    'https://evil.test/?u=https://ollama.com',
    'https://ollama.com@evil.test/',
    'https://user:pass@ollama.com/',
    'https://ollama.com:8443/',
    'https://www.ollama.com/',
    'https://notollama.com/',
    'https://ollama.com./',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,hi',
    'ollama.com/download',
    '',
  ])('refuses %j', (url) => {
    expect(isOfficialOllamaUrl(url)).toBe(false);
  });
});

describe('openExternal', () => {
  it('opens an official page through Tauri when running inside it', async () => {
    const openInTauri = vi.fn(async () => undefined);
    const openInBrowser = vi.fn();

    const opened = await openExternal('https://ollama.com/download', {
      isTauri: true,
      openInTauri,
      openInBrowser,
    });

    expect(opened).toBe(true);
    expect(openInTauri).toHaveBeenCalledWith('https://ollama.com/download');
    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it('opens a browser tab when not inside Tauri', async () => {
    const openInTauri = vi.fn(async () => undefined);
    const openInBrowser = vi.fn();

    const opened = await openExternal('https://ollama.com/download', {
      isTauri: false,
      openInTauri,
      openInBrowser,
    });

    expect(opened).toBe(true);
    expect(openInBrowser).toHaveBeenCalledWith('https://ollama.com/download');
    expect(openInTauri).not.toHaveBeenCalled();
  });

  it('refuses any other address and opens nothing', async () => {
    const openInTauri = vi.fn(async () => undefined);
    const openInBrowser = vi.fn();

    const opened = await openExternal('https://evil.test/', {
      isTauri: true,
      openInTauri,
      openInBrowser,
    });

    expect(opened).toBe(false);
    expect(openInTauri).not.toHaveBeenCalled();
    expect(openInBrowser).not.toHaveBeenCalled();
  });

  it('says it did not open when the opener fails', async () => {
    const opened = await openExternal('https://ollama.com/download', {
      isTauri: true,
      openInTauri: () => Promise.reject(new Error('not allowed')),
    });

    expect(opened).toBe(false);
  });
});
