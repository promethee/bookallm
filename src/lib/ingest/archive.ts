import { strFromU8, unzipSync } from 'fflate';
import { fail, ok, type Result } from './result';

/** Text entries of an EPUB by archive path. Images, fonts and other binaries are skipped. */
export type EpubFiles = Record<string, Uint8Array>;

/** Cap on the total decompressed size of text entries (guards against zip bombs). */
export const MAX_TOTAL_TEXT_SIZE = 200 * 1024 * 1024;

export const CONTAINER_PATH = 'META-INF/container.xml';

export interface ReadArchiveOptions {
  maxTotalSize?: number;
}

class SizeCapExceeded extends Error {}

const isTextEntry = (name: string): boolean =>
  !name.endsWith('/') &&
  (name.startsWith('META-INF/') ||
    /\.(opf|ncx|xhtml|html|htm|xml)$/i.test(name));

/**
 * Unzips only the text entries of an EPUB. Not a zip, or a zip without the EPUB
 * container description → `not-an-epub`. Text larger than the cap → `malformed-epub`.
 */
export function readArchive(
  bytes: Uint8Array,
  options: ReadArchiveOptions = {},
): Result<EpubFiles> {
  const maxTotalSize = options.maxTotalSize ?? MAX_TOTAL_TEXT_SIZE;
  let total = 0;
  let files: EpubFiles;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!isTextEntry(file.name)) return false;
        total += file.originalSize;
        if (total > maxTotalSize) throw new SizeCapExceeded();
        return true;
      },
    });
  } catch (error) {
    return error instanceof SizeCapExceeded
      ? fail('malformed-epub')
      : fail('not-an-epub');
  }
  if (!files[CONTAINER_PATH]) return fail('not-an-epub');
  return ok(files);
}

/** Decodes an archive entry as UTF-8 text, dropping any byte-order mark. */
export function readText(files: EpubFiles, path: string): string | undefined {
  const data = files[path];
  if (!data) return undefined;
  const text = strFromU8(data);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
