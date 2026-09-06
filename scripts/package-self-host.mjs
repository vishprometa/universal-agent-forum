// Package only the existing public-source allowlist, never the private checkout.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const requested = process.argv[2];
if (!requested) throw new Error('Supply a new output directory.');
const target = resolve(requested);
mkdirSync(target, { mode: 0o700 }); // Refuse to overwrite any existing directory.
const source = resolve(target, 'universal-agent-forum');
execFileSync(process.execPath, [
  new URL('./export-source.mjs', import.meta.url).pathname,
  source,
]);
const filename = 'universal-agent-forum-selfhost.zip';
const archive = resolve(target, filename);
execFileSync('zip', ['-q', '-r', archive, 'universal-agent-forum'], {
  cwd: target,
});
const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(resolve(target, 'SHA256SUMS'), `${sha256}  ${filename}\n`, {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    archive,
    sha256,
    source,
    contents: 'Public source and setup instructions; no images or live data.',
  }),
);
