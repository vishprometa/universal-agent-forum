import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const plugin = resolve(root, 'plugins/universal-agent-forum');
copyFileSync(
  resolve(root, 'public/examples/forum.mjs'),
  resolve(plugin, 'skills/uaf/scripts/forum.mjs'),
);
copyFileSync(resolve(root, 'LICENSE'), resolve(plugin, 'LICENSE'));
copyFileSync(resolve(root, 'LICENSE'), resolve(plugin, 'skills/uaf/LICENSE'));
mkdirSync(resolve(plugin, 'skills/uaf/references'), { recursive: true });
copyFileSync(
  resolve(root, 'public/self-host.md'),
  resolve(plugin, 'skills/uaf/references/self-host.md'),
);
const output = process.argv[2];
if (output) {
  const archive = resolve(output);
  if (existsSync(archive))
    throw new Error(
      'Choose a new archive path so stale ZIP entries cannot be retained.',
    );
  const work = mkdtempSync(join(tmpdir(), 'uaf-plugin-'));
  try {
    const stagedPlugin = join(work, 'plugin');
    const kit = join(work, 'kit');
    cpSync(plugin, stagedPlugin, { recursive: true });
    execFileSync(process.execPath, [
      resolve(root, 'scripts/package-self-host.mjs'),
      kit,
    ]);
    const assets = join(stagedPlugin, 'skills/uaf/assets/selfhost');
    mkdirSync(assets, { recursive: true });
    copyFileSync(
      join(kit, 'universal-agent-forum-selfhost.zip'),
      join(assets, 'universal-agent-forum-selfhost.zip'),
    );
    copyFileSync(join(kit, 'SHA256SUMS'), join(assets, 'SHA256SUMS'));
    const sha256 = readFileSync(join(kit, 'SHA256SUMS'), 'utf8').split(
      /\s+/,
    )[0];
    writeFileSync(
      join(assets, 'PORTABLE-SELF-HOST.json'),
      JSON.stringify(
        {
          schema_version: 1,
          archive: 'universal-agent-forum-selfhost.zip',
          sha256,
          instructions: '../../references/self-host.md',
          extracted_instructions: 'universal-agent-forum/public/self-host.md',
          requires_operator_authorization: true,
          requires_central_uaf_service: false,
        },
        null,
        2,
      ) + '\n',
    );
    execFileSync(
      'zip',
      ['-q', '-r', archive, '.codex-plugin', '.mcp.json', 'skills', 'LICENSE'],
      { cwd: stagedPlugin },
    );
    console.log(
      'Packaged the plugin with its MCP connection, clients, local guide, checksummed source kit, and license.',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
} else {
  console.log(
    'Synchronized plugin client, self-host guide, and license from their canonical sources.',
  );
}
