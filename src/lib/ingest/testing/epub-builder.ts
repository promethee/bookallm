import { strToU8, zipSync, type Zippable } from 'fflate';

/** A content document inside the built EPUB. `body` is the markup inside `<body>`. */
export interface BuiltDocument {
  /** Path relative to the package folder, e.g. `ch1.xhtml`. */
  href: string;
  body: string;
}

export interface TocEntry {
  title: string;
  /** Relative to the package folder; may carry a fragment, e.g. `ch1.xhtml#part2`. */
  href: string;
  children?: TocEntry[];
}

export interface BuildEpubOptions {
  version?: 2 | 3;
  /** `null` leaves the title out of the metadata. */
  title?: string | null;
  authors?: string[];
  language?: string;
  documents: BuiltDocument[];
  /** Table of contents. `null` produces no navigation document at all. */
  toc?: TocEntry[] | null;
  /** Reading order as hrefs. Defaults to every document in order. */
  spine?: string[];
  /**
   * Extra archive entries by full path (e.g. `META-INF/rights.xml`). A `null` value
   * removes a generated entry (e.g. `META-INF/container.xml`) to build broken books.
   */
  files?: Record<string, string | Uint8Array | null>;
}

const PACKAGE_DIR = 'OEBPS';

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const xhtmlDocument = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">` +
  `<head><title>Document</title></head><body>${body}</body></html>`;

const navDocument = (entries: TocEntry[]): string => {
  const list = (items: TocEntry[]): string =>
    `<ol>${items
      .map(
        (item) =>
          `<li><a href="${escapeXml(item.href)}">${escapeXml(item.title)}</a>` +
          `${item.children?.length ? list(item.children) : ''}</li>`,
      )
      .join('')}</ol>`;
  return xhtmlDocument(`<nav epub:type="toc">${list(entries)}</nav>`);
};

const ncxDocument = (entries: TocEntry[]): string => {
  let playOrder = 0;
  const points = (items: TocEntry[]): string =>
    items
      .map((item) => {
        playOrder += 1;
        return (
          `<navPoint id="np${playOrder}" playOrder="${playOrder}">` +
          `<navLabel><text>${escapeXml(item.title)}</text></navLabel>` +
          `<content src="${escapeXml(item.href)}"/>` +
          `${item.children?.length ? points(item.children) : ''}</navPoint>`
        );
      })
      .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">` +
    `<head/><docTitle><text>Book</text></docTitle><navMap>${points(entries)}</navMap></ncx>`
  );
};

const CONTAINER_XML =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
  `<rootfiles><rootfile full-path="${PACKAGE_DIR}/content.opf" ` +
  `media-type="application/oebps-package+xml"/></rootfiles></container>`;

/** Builds an in-memory EPUB archive for tests. */
export function buildEpub(options: BuildEpubOptions): Uint8Array {
  const version = options.version ?? 3;
  const toc = options.toc === undefined ? [] : options.toc;
  const navPath = version === 3 ? 'nav.xhtml' : 'toc.ncx';

  const metadata = [
    `<dc:identifier id="uid">urn:uuid:00000000-0000-0000-0000-000000000000</dc:identifier>`,
    options.title === null
      ? ''
      : `<dc:title>${escapeXml(options.title ?? 'Test Book')}</dc:title>`,
    ...(options.authors ?? ['Test Author']).map(
      (author) => `<dc:creator>${escapeXml(author)}</dc:creator>`,
    ),
    `<dc:language>${escapeXml(options.language ?? 'en')}</dc:language>`,
  ].join('');

  const manifest = [
    ...(toc === null
      ? []
      : [
          version === 3
            ? `<item id="nav" href="${navPath}" media-type="application/xhtml+xml" properties="nav"/>`
            : `<item id="ncx" href="${navPath}" media-type="application/x-dtbncx+xml"/>`,
        ]),
    ...options.documents.map(
      (doc, i) =>
        `<item id="doc${i}" href="${escapeXml(doc.href)}" media-type="application/xhtml+xml"/>`,
    ),
  ].join('');

  const idOf = (href: string): string =>
    `doc${options.documents.findIndex((d) => d.href === href)}`;
  const spineHrefs = options.spine ?? options.documents.map((d) => d.href);
  const spine = spineHrefs
    .map((href) => `<itemref idref="${idOf(href)}"/>`)
    .join('');

  const packageXml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<package xmlns="http://www.idpf.org/2007/opf" version="${version === 3 ? '3.0' : '2.0'}" ` +
    `unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${metadata}</metadata>` +
    `<manifest>${manifest}</manifest>` +
    `<spine${version === 2 && toc !== null ? ' toc="ncx"' : ''}>${spine}</spine></package>`;

  const entries: Record<string, string | Uint8Array> = {
    'META-INF/container.xml': CONTAINER_XML,
    [`${PACKAGE_DIR}/content.opf`]: packageXml,
  };
  if (toc !== null) {
    entries[`${PACKAGE_DIR}/${navPath}`] =
      version === 3 ? navDocument(toc) : ncxDocument(toc);
  }
  for (const doc of options.documents) {
    entries[`${PACKAGE_DIR}/${doc.href}`] = xhtmlDocument(doc.body);
  }
  for (const [path, content] of Object.entries(options.files ?? {})) {
    if (content === null) delete entries[path];
    else entries[path] = content;
  }

  // The mimetype entry must come first and be stored uncompressed.
  const archive: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
  };
  for (const [path, content] of Object.entries(entries)) {
    archive[path] = typeof content === 'string' ? strToU8(content) : content;
  }
  return zipSync(archive);
}

/** An `encryption.xml` listing one encrypted resource per algorithm. */
export function encryptionXml(algorithms: string[]): string {
  const entries = algorithms
    .map(
      (algorithm, i) =>
        `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${escapeXml(algorithm)}"/>` +
        `<enc:CipherData><enc:CipherReference URI="OEBPS/resource${i}"/></enc:CipherData></enc:EncryptedData>`,
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ` +
    `xmlns:enc="http://www.w3.org/2001/04/xmlenc#">${entries}</encryption>`
  );
}

export const FONT_ALGORITHMS = {
  idpf: 'http://www.idpf.org/2008/embedding',
  adobe: 'http://ns.adobe.com/pdf/enc#RC',
} as const;

export const AES_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#aes128-cbc';
