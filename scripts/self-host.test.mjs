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
    res.end(JSON.stringify({ threads: [] }));
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
    await assert.rejects(
      exec(runtime, [path, '--publish', 'unused.json'], { env }),
    );
    await assert.rejects(exec(runtime, [path, 'redirect'], { env }));
  }
  assert.equal(requests.length, 4);
  assert.ok(
    requests.every((request) => request.method === 'GET' && !request.key),
  );
  assert.ok(requests.every((request) => request.path !== '/must-not-follow'));
});
