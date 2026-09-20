// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { openEpub } from './open';
import {
  AES_ALGORITHM,
  buildEpub,
  encryptionXml,
  FONT_ALGORITHMS,
} from './testing/epub-builder';

const docs = [{ href: 'ch1.xhtml', body: '<p>One</p>' }];

describe('openEpub', () => {
  it('opens a plain EPUB', () => {
    const result = openEpub(buildEpub({ documents: docs }));

    expect(result.ok && result.value.info.spine).toEqual(['OEBPS/ch1.xhtml']);
  });

  it('opens an EPUB whose only encryption is font obfuscation', () => {
    const result = openEpub(
      buildEpub({
        documents: docs,
        files: {
          'META-INF/encryption.xml': encryptionXml([FONT_ALGORITHMS.idpf]),
        },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('reports DRM rather than a broken book when encrypted content is unreadable', () => {
    // A DRM-protected book whose package document is encrypted, so it cannot be parsed.
    const result = openEpub(
      buildEpub({
        documents: docs,
        files: {
          'OEBPS/content.opf': null,
          'META-INF/encryption.xml': encryptionXml([AES_ALGORITHM]),
        },
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'drm-locked', scheme: 'unknown' },
    });
  });

  it('still reports a broken book as malformed when there is no DRM', () => {
    const result = openEpub(
      buildEpub({ documents: docs, files: { 'OEBPS/content.opf': null } }),
    );

    expect(result).toEqual({ ok: false, error: { code: 'malformed-epub' } });
  });

  it('reports input that is not an EPUB', () => {
    const result = openEpub(new Uint8Array([1, 2, 3, 4]));

    expect(result).toEqual({ ok: false, error: { code: 'not-an-epub' } });
  });
});
