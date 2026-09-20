// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { extractDocument } from './text';

const doc = (body: string, head = '') =>
  `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head>${head}</head><body>${body}</body></html>`;

describe('extractDocument', () => {
  it('drops markup, decodes entities and collapses whitespace', () => {
    const result = extractDocument(
      doc(
        '<h1>Chapter  One</h1>\n<p>Hello <em>big</em> &amp; wide&nbsp;world\n  &mdash; ok &#233;t&eacute;</p>',
      ),
    );

    expect(result.paragraphs).toEqual([
      'Chapter One',
      'Hello big & wide world — ok été',
    ]);
  });

  it('ends a paragraph at a line break', () => {
    const result = extractDocument(
      doc('<p>Roses are red<br/>Violets are blue</p>'),
    );

    expect(result.paragraphs).toEqual(['Roses are red', 'Violets are blue']);
  });

  it('keeps inline markup inside one paragraph', () => {
    const result = extractDocument(
      doc('<p>a<b>b</b><i>c</i> <span>d</span></p>'),
    );

    expect(result.paragraphs).toEqual(['abc d']);
  });

  it('ignores navigation lists, scripts, styles, SVG and the head', () => {
    const result = extractDocument(
      doc(
        '<nav><ol><li>Skip me</li></ol></nav><script>var x = 1;</script>' +
          '<style>p { color: red }</style><svg><text>Skip svg</text></svg><p>Keep</p>',
        '<title>Skip title</title>',
      ),
    );

    expect(result.paragraphs).toEqual(['Keep']);
  });

  it('records the paragraph each id sits in', () => {
    const result = extractDocument(
      doc(
        '<p>Zero</p><h2 id="two">Two</h2><p>Three <a id="mid"></a>tail</p><p id="four">Four</p>',
      ),
    );

    expect(result.anchors.get('two')).toBe(1);
    expect(result.anchors.get('mid')).toBe(2);
    expect(result.anchors.get('four')).toBe(3);
  });

  it('maps an id on an empty element to the next paragraph', () => {
    const result = extractDocument(doc('<p>A</p><div id="gap"></div><p>B</p>'));

    expect(result.anchors.get('gap')).toBe(1);
  });

  it('maps a trailing id past the last paragraph', () => {
    const result = extractDocument(doc('<p>A</p><span id="end"></span>'));

    expect(result.anchors.get('end')).toBe(1);
  });

  it('understands legacy named anchors', () => {
    const result = extractDocument(doc('<p>A</p><a name="old"></a><p>B</p>'));

    expect(result.anchors.get('old')).toBe(1);
  });

  it('finds the first heading', () => {
    const result = extractDocument(
      doc('<p>Intro</p><h2>The Title</h2><h3>Sub</h3>'),
    );

    expect(result.heading).toBe('The Title');
  });

  it('reports where the first heading sits', () => {
    const result = extractDocument(doc('<p>Intro</p><h2>The Title</h2>'));

    expect(result.headingIndex).toBe(1);
  });

  it('gives the same output for the same input', () => {
    const input = doc('<h1>A</h1><p>B &amp; C</p><p id="x">D</p>');

    expect(extractDocument(input)).toEqual(extractDocument(input));
  });

  it('returns no paragraphs for a document with only an image', () => {
    const result = extractDocument(
      doc('<div><img src="cover.jpg" alt=""/></div>'),
    );

    expect(result.paragraphs).toEqual([]);
  });
});
