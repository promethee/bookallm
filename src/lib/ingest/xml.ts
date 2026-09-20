import { DomUtils, parseDocument } from 'htmlparser2';

export type XmlDocument = ReturnType<typeof parseXml>;
export type XmlElement = ReturnType<
  typeof DomUtils.getElementsByTagName
>[number];

export const parseXml = (text: string) =>
  parseDocument(text, { xmlMode: true });

/** Tag name without any namespace prefix (`dc:title` → `title`). */
const localName = (name: string): string => name.slice(name.indexOf(':') + 1);

/** All elements with the given local name, in document order, ignoring prefixes. */
export const elementsByLocalName = (
  name: string,
  root: XmlDocument | XmlElement,
): XmlElement[] =>
  DomUtils.getElementsByTagName((tag) => localName(tag) === name, root);

export const attr = (element: XmlElement, name: string): string | undefined =>
  DomUtils.getAttributeValue(element, name);

/** Text content with surrounding whitespace removed. */
export const textOf = (element: XmlElement): string =>
  DomUtils.textContent(element).trim();
