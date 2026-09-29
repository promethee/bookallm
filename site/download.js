// Picks the right BookaLLM installer for the visitor's system from a GitHub release.
// Pure functions, so they can be tested without a browser or the network.

/**
 * The visitor's system, from the browser's user agent and platform strings:
 * 'windows', 'mac', 'linux' or 'unknown'. Phones and tablets are 'unknown': there is no
 * BookaLLM for them.
 * @param {string} userAgent
 * @param {string} [platform]
 * @returns {'windows' | 'mac' | 'linux' | 'unknown'}
 */
export function detectSystem(userAgent, platform = '') {
  const text = `${userAgent} ${platform}`;
  if (/Android|iPhone|iPad|iPod/i.test(text)) return 'unknown';
  if (/Windows|Win32|Win64/i.test(text)) return 'windows';
  if (/Mac/i.test(text)) return 'mac';
  if (/Linux|X11/i.test(text)) return 'linux';
  return 'unknown';
}

/**
 * Each installer kind BookaLLM publishes, by the end of its file name, in the order they
 * are offered. `label` is a key into the site's texts.
 */
export const INSTALLERS = [
  { system: 'windows', label: 'windows', ending: '_x64-setup.exe' },
  { system: 'mac', label: 'macArm', ending: '_aarch64.dmg' },
  { system: 'mac', label: 'macIntel', ending: '_x64.dmg' },
  { system: 'linux', label: 'linuxAppImage', ending: '.AppImage' },
  { system: 'linux', label: 'linuxDeb', ending: '.deb' },
];

/**
 * The installers found in a GitHub release (its `assets`), for one system or, with
 * `'all'`, for every system. An installer missing from the release is left out.
 * @param {{ assets?: { name: string, browser_download_url: string, size: number }[] }} release
 * @param {'windows' | 'mac' | 'linux' | 'unknown' | 'all'} system
 * @returns {{ label: string, name: string, url: string, size: number }[]}
 */
export function pickAssets(release, system) {
  const assets = release?.assets ?? [];
  return INSTALLERS.filter(
    (installer) => system === 'all' || installer.system === system,
  ).flatMap((installer) => {
    const asset = assets.find((a) => a.name.endsWith(installer.ending));
    return asset
      ? [
          {
            label: installer.label,
            name: asset.name,
            url: asset.browser_download_url,
            size: asset.size,
          },
        ]
      : [];
  });
}
