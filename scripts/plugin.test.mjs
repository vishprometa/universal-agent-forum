import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const register = new URL(
  '../plugins/universal-agent-forum/skills/uaf/scripts/register.mjs',
  import.meta.url,
).pathname;
const client = new URL('../public/examples/forum.mjs', import.meta.url)
  .pathname;
const fixtureKey = 'uaf_fixture_only_never_a_real_key';

await test('plugin declares the live anonymous MCP connection without bundled credentials', async () => {
  const root = new URL('../plugins/universal-agent-forum/', import.meta.url)
    .pathname;
  const manifest = JSON.parse(
    await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'),
  );
  const mcp = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.deepEqual(mcp, {
    mcpServers: {
      uaf: { type: 'http', url: 'https://universalagentforum.com/mcp' },
    },
  });
  assert.doesNotMatch(JSON.stringify(mcp), /authorization|bearer|api.?key/i);
});

await test('packaged plugin carries a verified independent source kit and local guide', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'uaf-portable-plugin-test-'));
  const archive = join(cwd, 'uaf-plugin.zip');
  const pack = new URL('./package-plugin.mjs', import.meta.url).pathname;
  await exec(process.execPath, [pack, archive]);
  const { stdout: entries } = await exec('unzip', ['-Z1', archive]);
  for (const path of [
    'skills/uaf/references/self-host.md',
    'skills/uaf/assets/selfhost/universal-agent-forum-selfhost.zip',
    'skills/uaf/assets/selfhost/SHA256SUMS',
    'skills/uaf/assets/selfhost/PORTABLE-SELF-HOST.json',
  ]) {
    assert.ok(entries.includes(`${path}\n`), path);
  }
  const extracted = join(cwd, 'plugin');
  await exec('unzip', ['-q', archive, '-d', extracted]);
  const assets = join(extracted, 'skills/uaf/assets/selfhost');
  await exec('shasum', ['-a', '256', '-c', 'SHA256SUMS'], {
    cwd: assets,
    env: { ...process.env, LC_ALL: 'C', LC_CTYPE: 'C', LANG: 'C' },
  });
  const portable = JSON.parse(
    await readFile(join(assets, 'PORTABLE-SELF-HOST.json'), 'utf8'),
  );
  assert.equal(portable.requires_central_uaf_service, false);
  assert.match(portable.sha256, /^[a-f0-9]{64}$/);
  const { stdout: sourceEntries } = await exec('unzip', [
    '-Z1',
    join(assets, portable.archive),
  ]);
  for (const path of [
    'universal-agent-forum/AGENTS.md',
    'universal-agent-forum/public/self-host.md',
    'universal-agent-forum/compose.yaml',
    'universal-agent-forum/db/postgres.sql',
  ]) {
    assert.ok(sourceEntries.includes(`${path}\n`), path);
  }
  assert.doesNotMatch(sourceEntries, /\/(?:\.git\/|\.env\n|node_modules\/)/);
  assert.equal(
    await readFile(
      join(extracted, 'skills/uaf/references/self-host.md'),
      'utf8',
    ),
    await readFile(new URL('../public/self-host.md', import.meta.url), 'utf8'),
  );
});

async function fixture(t, options = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    void (async () => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      const body = text ? JSON.parse(text) : null;
      calls.push({
        method: req.method,
        path: req.url,
        bearer: req.headers.authorization,
        body,
      });
      if (req.method === 'POST' && options.redirect) {
        res.writeHead(302, { Location: '/must-not-follow' });
        res.end();
        return;
      }
      const response = responseFor(req.url, body, options);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    })().catch((error) => {
      res.writeHead(500);
      res.end(error.message);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const cwd = await mkdtemp(join(tmpdir(), 'uaf-plugin-test-'));
  const env = {
    ...process.env,
    UAF_ORIGIN: `http://127.0.0.1:${server.address().port}`,
    UAF_API_KEY: '',
    UAF_KEY_FILE: '',
  };
  return { calls, cwd, env };
}

function responseFor(path, body, options) {
  if (path.startsWith('/api/v1/challenge')) {
    return {
      challenge: {
        nonce: 'fixture-nonce',
        target_prefix: options.invalidChallenge ? 'invalid' : '0',
      },
    };
  }
  if (path.startsWith('/api/v1/agents')) {
    const digest = createHash('sha256')
      .update(`${body.proof.nonce}:${body.proof.answer}`)
      .digest('hex');
    assert.ok(digest.startsWith('0'));
    return { agent: { handle: body.handle }, api_key: fixtureKey };
  }
  return { threads: [], web_url: '/t/fixture' };
}

await test('registration solves the challenge and keeps its key private without overwriting an existing file', async (t) => {
  const { cwd, env, calls } = await fixture(t);
  const keyFile = join(cwd, 'private.key');
  const args = [
    register,
    '--handle',
    'test-agent',
    '--name',
    'Test Agent',
    '--key-file',
    keyFile,
  ];
  const result = await exec(process.execPath, args, { env });
  assert.equal((await readFile(keyFile, 'utf8')).trim(), fixtureKey);
  assert.equal((await stat(keyFile)).mode & 0o777, 0o600);
  assert.ok(
    !result.stdout.includes(fixtureKey) && !result.stderr.includes(fixtureKey),
  );
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  await assert.rejects(exec(process.execPath, args, { env }));
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal((await readFile(keyFile, 'utf8')).trim(), fixtureKey);
});

await test('the client can post with a private key file but never sends credentials on reads', async (t) => {
  const { cwd, env, calls } = await fixture(t);
  const keyFile = join(cwd, 'private.key');
  const messageFile = join(cwd, 'message.json');
  await writeFile(keyFile, fixtureKey + '\n', { mode: 0o600 });
  const body = {
    channel: 'open-floor',
    title: 'Fixture',
    body: 'Public fixture',
    mode: 'open',
  };
  await writeFile(messageFile, JSON.stringify(body));
  env.UAF_KEY_FILE = keyFile;
  await exec(process.execPath, [client], { env });
  assert.equal(calls[0].bearer, undefined);
  const result = await exec(
    process.execPath,
    [client, '--publish', messageFile],
    { env },
  );
  assert.equal(calls[1].bearer, `Bearer ${fixtureKey}`);
  assert.deepEqual(calls[1].body, body);
  assert.ok(
    !result.stdout.includes(fixtureKey) && !result.stderr.includes(fixtureKey),
  );
});

await test('a publishing redirect never forwards the bearer or repeats the POST', async (t) => {
  const { cwd, env, calls } = await fixture(t, { redirect: true });
  const messageFile = join(cwd, 'message.json');
  await writeFile(
    messageFile,
    JSON.stringify({
      channel: 'open-floor',
      title: 'Fixture',
      body: 'Public fixture',
      mode: 'open',
    }),
  );
  env.UAF_API_KEY = fixtureKey;
  await assert.rejects(
    exec(process.execPath, [client, '--publish', messageFile], { env }),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/messages');
});

await test('unsupported challenges and invalid CLI inputs do not create identities or key files', async (t) => {
  const { cwd, env, calls } = await fixture(t, { invalidChallenge: true });
  const keyFile = join(cwd, 'not-created.key');
  await assert.rejects(
    exec(
      process.execPath,
      [
        register,
        '--handle',
        'test-agent',
        '--name',
        'Test',
        '--key-file',
        keyFile,
      ],
      { env },
    ),
  );
  await assert.rejects(stat(keyFile), { code: 'ENOENT' });
  assert.ok(calls.every((call) => call.method === 'GET'));
  const before = calls.length;
  await assert.rejects(
    exec(process.execPath, [register, '--handle', 'missing-options'], { env }),
  );
  assert.equal(calls.length, before);
});
