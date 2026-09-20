import { readText, type EpubFiles } from './archive';
import { fail, ok, type Result } from './result';
import type { DrmScheme } from './types';
import { attr, elementsByLocalName, parseXml } from './xml';

const RIGHTS_PATH = 'META-INF/rights.xml';
const APPLE_PATH = 'META-INF/sinf.xml';
const READIUM_PATH = 'META-INF/license.lcpl';
const ENCRYPTION_PATH = 'META-INF/encryption.xml';

/**
 * Font obfuscation (IDPF and Adobe) is a licensing convenience, not DRM. Any other
 * encryption algorithm is treated as DRM, which errs on the side of rejecting.
 */
const FONT_OBFUSCATION_ALGORITHMS = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
]);

/** Names the DRM scheme protecting the EPUB, or `undefined` when it has none. */
export function detectDrm(files: EpubFiles): DrmScheme | undefined {
  if (files[RIGHTS_PATH]) return 'adobe';
  if (files[APPLE_PATH]) return 'apple';
  if (files[READIUM_PATH]) return 'readium';

  const encryption = readText(files, ENCRYPTION_PATH);
  if (encryption === undefined) return undefined;
  const encrypted = elementsByLocalName('EncryptedData', parseXml(encryption));
  const usesContentEncryption = encrypted.some((data) => {
    const method = elementsByLocalName('EncryptionMethod', data)[0];
    const algorithm = method && attr(method, 'Algorithm');
    return !algorithm || !FONT_OBFUSCATION_ALGORITHMS.has(algorithm);
  });
  return usesContentEncryption ? 'unknown' : undefined;
}

/** Fails with `drm-locked` (naming the scheme) when the EPUB is DRM-protected. */
export function checkDrm(files: EpubFiles): Result<void> {
  const scheme = detectDrm(files);
  return scheme ? fail('drm-locked', scheme) : ok(undefined);
}
