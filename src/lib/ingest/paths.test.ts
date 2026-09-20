import { describe, expect, it } from 'vitest';
import { resolveHref } from './paths';

describe('resolveHref', () => {
  it('resolves a sibling file', () => {
    expect(resolveHref('OEBPS/nav.xhtml', 'ch1.xhtml')).toEqual({
      path: 'OEBPS/ch1.xhtml',
    });
  });

  it('collapses parent segments', () => {
    expect(resolveHref('OEBPS/text/a.xhtml', '../images/../b.xhtml')).toEqual({
      path: 'OEBPS/b.xhtml',
    });
  });

  it('splits off and decodes the fragment', () => {
    expect(resolveHref('OEBPS/nav.xhtml', 'ch1.xhtml#part%202')).toEqual({
      path: 'OEBPS/ch1.xhtml',
      fragment: 'part 2',
    });
  });

  it('decodes percent-encoded paths', () => {
    expect(resolveHref('OEBPS/nav.xhtml', 'Cha%CC%82pitre.xhtml').path).toBe(
      'OEBPS/Châpitre.xhtml',
    );
  });

  it('treats a leading slash as the archive root', () => {
    expect(resolveHref('OEBPS/text/a.xhtml', '/OEBPS/b.xhtml')).toEqual({
      path: 'OEBPS/b.xhtml',
    });
  });
});
