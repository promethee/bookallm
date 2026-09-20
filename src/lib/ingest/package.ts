import { CONTAINER_PATH, readText, type EpubFiles } from './archive';
import { resolveHref } from './paths';
import { fail, ok, type Result } from './result';
import { attr, elementsByLocalName, parseXml, textOf } from './xml';

/** What the package document (OPF) says about a book. */
export interface PackageInfo {
  /** Empty when the package declares no title. */
  title: string;
  authors: string[];
  language: string;
  /** Archive paths of the content documents, in reading order. */
  spine: string[];
  /** EPUB 3 navigation document, when declared. */
  navPath?: string;
  /** EPUB 2 NCX, when declared. */
  ncxPath?: string;
}

const HTML_MEDIA_TYPES = new Set(['application/xhtml+xml', 'text/html']);
const NCX_MEDIA_TYPE = 'application/x-dtbncx+xml';

interface ManifestItem {
  path: string;
  mediaType: string;
  properties: string[];
}

/**
 * Reads the container and package documents. A container that names no package, a
 * missing or empty package, or a reading order that references missing documents
 * → `malformed-epub`.
 */
export function parsePackage(files: EpubFiles): Result<PackageInfo> {
  const containerXml = readText(files, CONTAINER_PATH);
  if (containerXml === undefined) return fail('not-an-epub');

  const rootfile = elementsByLocalName('rootfile', parseXml(containerXml)).find(
    (element) => attr(element, 'full-path'),
  );
  const opfPath = rootfile && attr(rootfile, 'full-path');
  if (!opfPath) return fail('malformed-epub');

  const opfFile = resolveHref('', opfPath).path;
  const opfXml = readText(files, opfFile);
  if (opfXml === undefined) return fail('malformed-epub');
  const opf = parseXml(opfXml);

  const manifest = new Map<string, ManifestItem>();
  for (const item of elementsByLocalName('item', opf)) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    if (!id || href === undefined) continue;
    manifest.set(id, {
      path: resolveHref(opfFile, href).path,
      mediaType: attr(item, 'media-type') ?? '',
      properties: (attr(item, 'properties') ?? '').split(/\s+/).filter(Boolean),
    });
  }

  const spine: string[] = [];
  for (const itemref of elementsByLocalName('itemref', opf)) {
    const item = manifest.get(attr(itemref, 'idref') ?? '');
    if (!item) return fail('malformed-epub');
    // Non-document spine entries (e.g. an SVG cover page) carry no chapter text.
    if (!HTML_MEDIA_TYPES.has(item.mediaType)) continue;
    if (!files[item.path]) return fail('malformed-epub');
    spine.push(item.path);
  }
  if (spine.length === 0) return fail('malformed-epub');

  const items = [...manifest.values()];
  const spineElement = elementsByLocalName('spine', opf)[0];
  const ncxId = spineElement && attr(spineElement, 'toc');
  const ncx =
    (ncxId ? manifest.get(ncxId) : undefined) ??
    items.find((item) => item.mediaType === NCX_MEDIA_TYPE);
  const nav = items.find((item) => item.properties.includes('nav'));

  const authors = elementsByLocalName('creator', opf)
    .map(textOf)
    .filter(Boolean);
  const title = elementsByLocalName('title', opf)[0];
  const language = elementsByLocalName('language', opf)[0];

  return ok({
    title: title ? textOf(title) : '',
    authors,
    language: language ? textOf(language) : '',
    spine,
    navPath: nav?.path,
    ncxPath: ncx?.path,
  });
}
