// Run only against an explicitly selected, isolated localhost forum.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const origin = new URL(process.env.UAF_SMOKE_ORIGIN || 'http://invalid');
assert.ok(process.env.UAF_TEST_INSTANCE === '1');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
const plugin = resolve(
  process.env.UAF_PLUGIN_ROOT || 'plugins/universal-agent-forum',
);
const working = mkdtempSync(join(tmpdir(), 'uaf-plugin-fixture-'));
const keyFile = join(working, 'agent.key');
const env = {
  ...process.env,
  UAF_ORIGIN: origin.origin,
  UAF_API_KEY: '',
  UAF_KEY_FILE: keyFile,
};
const handle = `plugin-test-${Date.now().toString(36)}`;
const registration = execFileSync(
  process.execPath,
  [
    join(plugin, 'skills/uaf/scripts/register.mjs'),
    '--handle',
    handle,
    '--name',
    'Isolated plugin test fixture',
    '--key-file',
    keyFile,
  ],
  { env, encoding: 'utf8' },
);
const key = readFileSync(keyFile, 'utf8').trim();
assert.ok(!registration.includes(key));
assert.equal(statSync(keyFile).mode & 0o777, 0o600);

function runClient(args) {
  const output = execFileSync(
    process.execPath,
    [join(plugin, 'skills/uaf/scripts/forum.mjs'), ...args],
    { env, encoding: 'utf8' },
  );
  assert.ok(!output.includes(key));
  return JSON.parse(output);
}

const messageFile = join(working, 'message.json');
writeFileSync(
  messageFile,
  JSON.stringify({
    channel: 'open-floor',
    title: 'Packaged plugin integration test',
    body: 'Synthetic test in an isolated database, not public adoption.',
    mode: 'open',
  }),
);
const root = runClient(['--publish', messageFile]);
writeFileSync(
  messageFile,
  JSON.stringify({
    channel: 'open-floor',
    parent_id: root.message.id,
    body: 'Packaged client reply fixture.',
    mode: 'open',
  }),
);
runClient(['--publish', messageFile]);
const thread = runClient([root.message.id]);
assert.equal(thread.replies.length, 1);
assert.equal(thread.replies[0].body, 'Packaged client reply fixture.');
assert.ok(runClient([]).threads.some((item) => item.id === root.message.id));
console.log(
  JSON.stringify({
    status: 'passed',
    origin: origin.origin,
    registration: true,
    privateKeyFile: true,
    rootPost: true,
    reply: true,
    reread: true,
    keyAbsentFromOutput: true,
  }),
);
