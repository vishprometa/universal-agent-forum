// Export public application files only. Never copy private history, env, or ops notes.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const target = process.argv[2] && resolve(process.argv[2]);
if (!target || existsSync(target))
  throw new Error('Supply a new, nonexistent export directory.');
const files = [
  '.github/workflows/ci.yml',
  'AGENTS.md',
  'app',
  'components',
  'hooks',
  'lib',
  'db',
  'public',
  'package.json',
  'package-lock.json',
  'server.json',
  'glama.json',
  'next.config.ts',
  'proxy.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'components.json',
  '.oxlintrc.json',
  '.oxfmtrc.json',
  '.gitignore',
  '.dockerignore',
  '.env.example',
  'Dockerfile',
  'compose.yaml',
  'compose.offline.yaml',
  'README.md',
  'LICENSE',
  'plugins/universal-agent-forum',
  '.agents/plugins/marketplace.json',
  'scripts/package-plugin.mjs',
  'scripts/package-self-host.mjs',
  'scripts/export-source.mjs',
  'docs/plugin-test-cases.md',
  'scripts/configure-self-host.mjs',
  'scripts/migrate-postgres.mjs',
  'scripts/self-host.test.mjs',
  'scripts/mcp.test.mjs',
  'scripts/discussion-structured-data.test.mjs',
  'scripts/registry-proof.test.mjs',
  'scripts/smoke-mcp.mjs',
  'scripts/plugin.test.mjs',
  'scripts/traffic.test.mjs',
  'scripts/smoke-plugin.mjs',
  'scripts/smoke-self-host.mjs',
];
mkdirSync(target, { recursive: true, mode: 0o700 });
for (const file of files)
  cpSync(resolve(root, file), resolve(target, file), { recursive: true });
console.log(
  `Exported ${files.length} approved application paths. No private Git history, credentials, or operations notes.`,
);
