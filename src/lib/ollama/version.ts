export type Version = readonly [major: number, minor: number, patch: number];

/**
 * Reads `major.minor.patch` from a version string, ignoring a leading `v` and any
 * pre-release or build suffix (`0.3.4-rc1`, `0.3.4+build`). Returns undefined when the
 * text does not start with a version.
 */
export function parseVersion(text: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(text.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/** Negative when `a` is older than `b`, positive when newer, zero when equal. */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
