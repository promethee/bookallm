import { readArchive, type EpubFiles } from './archive';
import { checkDrm } from './drm';
import { parsePackage, type PackageInfo } from './package';
import { fail, ok, type Result } from './result';

export interface OpenedEpub {
  files: EpubFiles;
  info: PackageInfo;
}

/**
 * Opens an EPUB: unzip, DRM check, then package parsing. The DRM check runs before
 * anything is parsed so encrypted content is reported as DRM, not as a broken book.
 */
export function openEpub(bytes: Uint8Array): Result<OpenedEpub> {
  try {
    const archive = readArchive(bytes);
    if (!archive.ok) return archive;

    const drm = checkDrm(archive.value);
    if (!drm.ok) return drm;

    const info = parsePackage(archive.value);
    if (!info.ok) return info;

    return ok({ files: archive.value, info: info.value });
  } catch {
    return fail('malformed-epub');
  }
}
