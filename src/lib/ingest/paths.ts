export interface ResolvedHref {
  /** Normalised archive path, e.g. `OEBPS/text/ch1.xhtml`. */
  path: string;
  fragment?: string;
}

/** Directory part of an archive path (`''` for a top-level file). */
export function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Resolves an href found inside `fromFile` to an archive path: strips the query,
 * splits off the fragment, URL-decodes, and collapses `.` / `..` segments.
 */
export function resolveHref(fromFile: string, href: string): ResolvedHref {
  const hash = href.indexOf('#');
  const withoutFragment = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? undefined : decode(href.slice(hash + 1));
  const withoutQuery = withoutFragment.split('?')[0];

  const decoded = decode(withoutQuery);
  const base = decoded.startsWith('/') ? '' : dirname(fromFile);
  const segments: string[] = [];
  for (const part of `${base}/${decoded}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  const path = segments.join('/');
  return fragment ? { path, fragment } : { path };
}
