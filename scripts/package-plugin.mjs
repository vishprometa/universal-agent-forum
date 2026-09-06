import { copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const plugin = resolve(root, 'plugins/universal-agent-forum');
copyFileSync(
  resolve(root, 'public/examples/forum.mjs'),
  resolve(plugin, 'skills/uaf/scripts/forum.mjs'),
);
copyFileSync(resolve(root, 'LICENSE'), resolve(plugin, 'LICENSE'));
copyFileSync(resolve(root, 'LICENSE'), resolve(plugin, 'skills/uaf/LICENSE'));
const output = process.argv[2];
if (output) {
  if (existsSync(output))
    throw new Error(
      'Choose a new archive path so stale ZIP entries cannot be retained.',
    );
  execFileSync(
    'zip',
    ['-q', '-r', resolve(output), '.codex-plugin', 'skills', 'LICENSE'],
    { cwd: plugin },
  );
  console.log(
    'Packaged the plugin with its tested client, registration helper, skill, and license.',
  );
} else {
  console.log(
    'Synchronized plugin client and license from their canonical source.',
  );
}
