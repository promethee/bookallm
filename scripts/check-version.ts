/**
 * Checks that the app's version is declared the same in its three places, and, when a
 * release tag is given, that the tag names that version. The release workflow runs it
 * first, so a mistyped tag builds nothing.
 *
 *   pnpm check:version           # the three declarations agree
 *   pnpm check:version v1.0.0    # ...and the tag matches them
 */
import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');

const declared: Record<string, string | undefined> = {
  'package.json': (JSON.parse(read('package.json')) as { version?: string })
    .version,
  'src-tauri/tauri.conf.json': (
    JSON.parse(read('src-tauri/tauri.conf.json')) as { version?: string }
  ).version,
  // The first `version = "…"` line is the one in [package].
  'src-tauri/Cargo.toml': /^version\s*=\s*"([^"]+)"/m.exec(
    read('src-tauri/Cargo.toml'),
  )?.[1],
};

const problems: string[] = [];
const versions = new Set(Object.values(declared));
if (versions.size !== 1 || versions.has(undefined))
  problems.push(
    `The version differs between files: ${Object.entries(declared)
      .map(([file, version]) => `${file} = ${version ?? '(none)'}`)
      .join(', ')}`,
  );

const version = declared['package.json'];
const tag = process.argv[2];
if (tag !== undefined && tag !== `v${version}`)
  problems.push(
    `The tag ${tag} does not match the version in the code (v${version}).`,
  );

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  console.log(`Version ${version}${tag ? `, tag ${tag}` : ''}: all agree.`);
}
