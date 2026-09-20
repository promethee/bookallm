import { Parser } from 'htmlparser2';

export interface ExtractedDocument {
  /** Non-empty paragraphs in reading order, whitespace collapsed. */
  paragraphs: string[];
  /**
   * Element ids (and legacy `<a name>` anchors) mapped to the index of the paragraph
   * they sit in or directly before. An id after the last paragraph maps to
   * `paragraphs.length`.
   */
  anchors: Map<string, number>;
  /** Text of the first heading, if any. */
  heading?: string;
  /** Index of the heading's paragraph in `paragraphs` (set with `heading`). */
  headingIndex?: number;
}

/** Elements whose start and end both break a paragraph. */
// prettier-ignore
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'body', 'caption', 'dd', 'details',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1',
  'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'html', 'li', 'main', 'ol', 'p',
  'pre', 'section', 'summary', 'table', 'td', 'th', 'tr', 'ul',
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** Elements whose content is not book text. */
const SKIPPED_TAGS = new Set(['head', 'nav', 'script', 'style', 'svg']);

/**
 * Turns a content document (XHTML) into plain paragraphs. Markup is dropped, entities
 * are decoded, whitespace inside a paragraph is collapsed, and block elements and
 * line breaks end a paragraph. Navigation lists, scripts, styles and SVG are ignored.
 */
export function extractDocument(xhtml: string): ExtractedDocument {
  const paragraphs: string[] = [];
  const anchors = new Map<string, number>();
  let heading: string | undefined;
  let headingIndex: number | undefined;
  let buffer = '';
  let skipDepth = 0;
  let headingDepth = 0;

  const flush = (): void => {
    const text = buffer.replace(/\s+/g, ' ').trim();
    buffer = '';
    if (!text) return;
    paragraphs.push(text);
    if (headingDepth > 0 && heading === undefined) {
      heading = text;
      headingIndex = paragraphs.length - 1;
    }
  };

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (SKIPPED_TAGS.has(name)) {
          skipDepth += 1;
          return;
        }
        if (skipDepth > 0) return;
        if (BLOCK_TAGS.has(name) || name === 'br') flush();
        if (HEADING_TAGS.has(name)) headingDepth += 1;
        const id =
          attributes.id || (name === 'a' ? attributes.name : undefined);
        if (id && !anchors.has(id)) anchors.set(id, paragraphs.length);
      },
      ontext(data) {
        if (skipDepth === 0) buffer += data;
      },
      onclosetag(name) {
        if (SKIPPED_TAGS.has(name)) {
          skipDepth = Math.max(0, skipDepth - 1);
          return;
        }
        if (skipDepth > 0) return;
        if (BLOCK_TAGS.has(name)) flush();
        if (HEADING_TAGS.has(name))
          headingDepth = Math.max(0, headingDepth - 1);
      },
    },
    { decodeEntities: true, recognizeSelfClosing: true },
  );
  parser.write(xhtml);
  parser.end();
  flush();

  return { paragraphs, anchors, heading, headingIndex };
}
