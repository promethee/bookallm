// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readArchive } from './archive';
import { checkDrm, detectDrm } from './drm';
import {
  AES_ALGORITHM,
  buildEpub,
  encryptionXml,
  FONT_ALGORITHMS,
  type BuildEpubOptions,
} from './testing/epub-builder';

const docs = [{ href: 'ch1.xhtml', body: '<p>One</p>' }];

function drmOf(files: BuildEpubOptions['files']) {
  const archive = readArchive(buildEpub({ documents: docs, files }));
  if (!archive.ok) throw new Error('archive failed');
  return detectDrm(archive.value);
}

describe('detectDrm', () => {
  it('reports no DRM for a plain EPUB', () => {
    expect(drmOf({})).toBeUndefined();
  });

  it('names the Adobe scheme for a rights file', () => {
    expect(drmOf({ 'META-INF/rights.xml': '<rights/>' })).toBe('adobe');
  });

  it('names the Apple scheme for a FairPlay protection file', () => {
    expect(drmOf({ 'META-INF/sinf.xml': '<sinf/>' })).toBe('apple');
  });

  it('names the Readium scheme for a license file', () => {
    expect(drmOf({ 'META-INF/license.lcpl': '{}' })).toBe('readium');
  });

  it('reports unknown DRM for content encrypted with another algorithm', () => {
    expect(
      drmOf({ 'META-INF/encryption.xml': encryptionXml([AES_ALGORITHM]) }),
    ).toBe('unknown');
  });

  it('reports unknown DRM when fonts and content are both encrypted', () => {
    const xml = encryptionXml([FONT_ALGORITHMS.idpf, AES_ALGORITHM]);

    expect(drmOf({ 'META-INF/encryption.xml': xml })).toBe('unknown');
  });

  it('reports unknown DRM when an encrypted resource names no algorithm', () => {
    const xml =
      '<encryption xmlns:enc="http://www.w3.org/2001/04/xmlenc#">' +
      '<enc:EncryptedData/></encryption>';

    expect(drmOf({ 'META-INF/encryption.xml': xml })).toBe('unknown');
  });

  it('does not treat font obfuscation as DRM', () => {
    const xml = encryptionXml([FONT_ALGORITHMS.idpf, FONT_ALGORITHMS.adobe]);

    expect(drmOf({ 'META-INF/encryption.xml': xml })).toBeUndefined();
  });

  it('prefers the named scheme when a rights file and encryption both exist', () => {
    expect(
      drmOf({
        'META-INF/rights.xml': '<rights/>',
        'META-INF/encryption.xml': encryptionXml([AES_ALGORITHM]),
      }),
    ).toBe('adobe');
  });
});

describe('checkDrm', () => {
  it('fails with drm-locked and the scheme', () => {
    const archive = readArchive(
      buildEpub({
        documents: docs,
        files: { 'META-INF/sinf.xml': '<sinf/>' },
      }),
    );
    if (!archive.ok) throw new Error('archive failed');

    expect(checkDrm(archive.value)).toEqual({
      ok: false,
      error: { code: 'drm-locked', scheme: 'apple' },
    });
  });
});
