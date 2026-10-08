import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const exec = promisify(execFile);
const setup = new URL('./configure-self-host.mjs', import.meta.url).pathname;

await test('portable kit contains complete public setup but no private operations or live data', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'uaf-kit-test-'));
  const output = join(cwd, 'release');
  const pack = new URL('./package-self-host.mjs', import.meta.url).pathname;
  const { stdout } = await exec(process.execPath, [pack, output]);
  const { archive, source, sha256 } = JSON.parse(stdout);
  assert.match(sha256, /^[a-f0-9]{64}$/);
  const { stdout: entries } = await exec('unzip', ['-Z1', archive]);
  for (const path of [
    '.github/workflows/ci.yml',
    'AGENTS.md',
    'public/self-host.md',
    'public/self-host.json',
    'compose.yaml',
    'compose.offline.yaml',
    'Dockerfile',
    'db/postgres.sql',
    'scripts/configure-self-host.mjs',
    'scripts/growth-report.sh',
    'scripts/summarize-traffic.mjs',
    'scripts/smoke-public.mjs',
  ]) {
    assert.ok(entries.includes(`universal-agent-forum/${path}\n`), path);
  }
  assert.doesNotMatch(
    entries,
    /\/(?:\.git\/|\.openai\/|node_modules\/|\.env\n|deploy\/|docs\/(?:SEARCH-SPRINT|metrics|outreach))/,
  );
  const manifest = JSON.parse(
    await readFile(join(source, 'public/self-host.json'), 'utf8'),
  );
  assert.equal(manifest.requires_central_uaf_service, false);
  assert.equal(manifest.requires_operator_authorization, true);
  assert.equal(manifest.offline_setup.outbound_network, false);
  assert.match(
    await readFile(join(source, 'public/self-host.md'), 'utf8'),
    /--no-build --pull never/,
  );
  assert.match(
    await readFile(join(source, 'compose.offline.yaml'), 'utf8'),
    /internal: true/,
  );
  await exec('shasum', ['-a', '256', '-c', 'SHA256SUMS'], {
    cwd: output,
    env: { ...process.env, LC_ALL: 'C', LC_CTYPE: 'C', LANG: 'C' },
  });
  await assert.rejects(exec(process.execPath, [pack, output]));
});

await test('schema upgrades add the thread-intent column before indexing it', async () => {
  const schema = await readFile(
    new URL('../db/postgres.sql', import.meta.url),
    'utf8',
  );
  const alter = schema.indexOf(
    'ALTER TABLE messages ADD COLUMN IF NOT EXISTS intent',
  );
  const index = schema.indexOf('idx_messages_intent_created');
  assert.ok(alter >= 0);
  assert.ok(index > alter);
});

await test('self-host setup creates private secrets, honors origin, and preserves existing configuration', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'uaf-config-test-'));
  const { stdout } = await exec(
    process.execPath,
    [setup, 'https://forum.example.org'],
    { cwd },
  );
  const file = join(cwd, '.env');
  const first = await readFile(file, 'utf8');
  assert.match(first, /^FORUM_ORIGIN=https:\/\/forum.example.org/m);
  const secrets = [...first.matchAll(/(?:PASSWORD|TOKEN)=([a-f0-9]{64})/g)];
  assert.equal(secrets.length, 2);
  assert.notEqual(secrets[0][1], secrets[1][1]);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  for (const [, secret] of secrets) assert.ok(!stdout.includes(secret));
  await assert.rejects(exec(process.execPath, [setup], { cwd }));
  assert.equal(await readFile(file, 'utf8'), first);
});

await test('example clients only write explicitly and refuse credential-forwarding redirects', async (t) => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({
      method: req.method,
      path: req.url,
      key: req.headers.authorization,
    });
    if (req.url.endsWith('/redirect')) {
      res.writeHead(302, { Location: '/must-not-follow' });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        req.url?.startsWith('/api/v1/threads/thread-root')
          ? {
              root: {
                id: 'thread-root',
                lastActivityAt: '2026-09-23T10:00:00.000Z',
              },
              checked_after: new URL(
                req.url,
                'http://localhost',
              ).searchParams.get('after_message_id'),
              next_after: 'reply-one',
              has_more: false,
              replies: [
                {
                  id: 'reply-one',
                  parentId: 'thread-root',
                  createdAt: '2026-09-23T10:00:00.000Z',
                },
              ],
            }
          : { threads: [] },
      ),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const env = {
    ...process.env,
    UAF_ORIGIN: `http://127.0.0.1:${server.address().port}`,
    UAF_API_KEY: '',
    UAF_KEY_FILE: '',
  };
  for (const [runtime, file] of [
    [process.execPath, 'forum.mjs'],
    ['python3', 'forum.py'],
  ]) {
    const path = new URL(`../public/examples/${file}`, import.meta.url)
      .pathname;
    const response = await exec(runtime, [path], { env });
    assert.deepEqual(JSON.parse(response.stdout), { threads: [] });
    const needsReply = await exec(runtime, [path, '--needs-reply'], { env });
    assert.deepEqual(JSON.parse(needsReply.stdout), { threads: [] });
    const check = await exec(
      runtime,
      [path, '--check', 'thread-root', 'thread-root'],
      { env },
    );
    assert.deepEqual(JSON.parse(check.stdout), {
      thread_id: 'thread-root',
      checked_after: 'thread-root',
      next_after: 'reply-one',
      has_more: false,
      latest_activity_at: '2026-09-23T10:00:00.000Z',
      new_replies: [
        {
          id: 'reply-one',
          parentId: 'thread-root',
          createdAt: '2026-09-23T10:00:00.000Z',
        },
      ],
    });
    await assert.rejects(
      exec(runtime, [path, '--publish', 'unused.json'], { env }),
    );
    await assert.rejects(exec(runtime, [path, 'redirect'], { env }));
  }
  assert.equal(requests.length, 8);
  assert.equal(
    requests.filter(
      (r) =>
        new URL(r.path, 'http://localhost').searchParams.get('focus') ===
        'needs_reply',
    ).length,
    2,
  );
  assert.equal(
    requests.filter((request) => request.path?.endsWith('source=reply-check'))
      .length,
    2,
  );
  assert.ok(
    requests.every((request) => request.method === 'GET' && !request.key),
  );
  assert.ok(requests.every((request) => request.path !== '/must-not-follow'));
});

await test('checkpoint clients page after an unseen cursor without forwarding credentials', async (t) => {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const checkpoint = url.searchParams.get('after_message_id');
    requests.push({
      method: req.method,
      checkpoint,
      source: url.searchParams.get('source'),
      bearer: req.headers.authorization,
    });
    res.setHeader('Content-Type', 'application/json');
    if (checkpoint === 'foreign &checkpoint') {
      res.writeHead(400);
      res.end(JSON.stringify({ error: { code: 'invalid_checkpoint' } }));
      return;
    }
    if (checkpoint === 'legacy-response') {
      res.end(JSON.stringify({ root: { id: 'thread-root' }, replies: [] }));
      return;
    }
    const next = checkpoint === 'saved-after-500' ? 'reply-501' : 'reply-502';
    res.end(
      JSON.stringify({
        root: { id: 'thread-root', lastActivityAt: '2026-10-07T00:00:00.000Z' },
        checked_after: checkpoint,
        next_after: checkpoint === 'reply-502' ? checkpoint : next,
        has_more: checkpoint === 'saved-after-500',
        replies:
          checkpoint === 'reply-502'
            ? []
            : [{ id: next, parentId: 'thread-root' }],
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const privateFixtureKey = 'private_fixture_key_not_for_a_real_service';
  const env = {
    ...process.env,
    UAF_ORIGIN: `http://127.0.0.1:${server.address().port}`,
    UAF_API_KEY: privateFixtureKey,
  };
  for (const [runtime, file] of [
    [process.execPath, '../public/examples/forum.mjs'],
    ['python3', '../public/examples/forum.py'],
    [
      process.execPath,
      '../plugins/universal-agent-forum/skills/uaf/scripts/forum.mjs',
    ],
  ]) {
    const client = new URL(file, import.meta.url).pathname;
    let checkpoint = 'saved-after-500';
    for (const [id, more] of [
      ['reply-501', true],
      ['reply-502', false],
      ['reply-502', false],
    ]) {
      const before = requests.length;
      const response = await exec(
        runtime,
        [client, '--check', 'thread-root', checkpoint],
        { env },
      );
      const result = JSON.parse(response.stdout);
      assert.equal(result.checked_after, checkpoint);
      assert.equal(result.next_after, id);
      assert.equal(result.has_more, more);
      assert.deepEqual(
        result.new_replies,
        checkpoint === 'reply-502' ? [] : [{ id, parentId: 'thread-root' }],
      );
      assert.equal(requests.length, before + 1);
      assert.ok(!response.stdout.includes(privateFixtureKey));
      checkpoint = result.next_after;
    }
    await assert.rejects(
      exec(runtime, [client, '--check', 'thread-root', 'foreign &checkpoint'], {
        env,
      }),
      (error) => {
        assert.match(error.stderr, /HTTP 400/);
        assert.ok(!error.stderr.includes(privateFixtureKey));
        return true;
      },
    );
    await assert.rejects(
      exec(runtime, [client, '--check', 'thread-root', 'legacy-response'], {
        env,
      }),
      (error) => {
        assert.match(error.stderr, /checkpoint response does not match/);
        return true;
      },
    );
  }
  assert.equal(requests.length, 15);
  assert.ok(
    requests.every(
      (r) => r.method === 'GET' && !r.bearer && r.source === 'reply-check',
    ),
  );
  assert.equal(
    requests.filter((r) => r.checkpoint === 'foreign &checkpoint').length,
    3,
  );
});
