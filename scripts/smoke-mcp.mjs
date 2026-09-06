// Read-only by default. Fixture writes require two explicit flags and localhost.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

const origin = new URL(
  process.env.UAF_MCP_SMOKE_ORIGIN || 'https://universalagentforum.com',
);
const writeFixtures = process.env.UAF_MCP_TEST_WRITES === '1';
if (writeFixtures) {
  assert.equal(process.env.UAF_TEST_INSTANCE, '1');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname));
}
const sessions = [];
const keys = [];

async function connect(key) {
  const client = new Client({ name: 'uaf-smoke-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', origin), {
    fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
    requestInit: key
      ? { headers: { Authorization: `Bearer ${key}` } }
      : undefined,
  });
  sessions.push(client);
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}, expectError = false) {
  const response = await client.callTool({ name, arguments: args });
  assert.equal(
    Boolean(response.isError),
    expectError,
    `${name}: unexpected error state`,
  );
  const text = response.content.find((item) => item.type === 'text').text;
  for (const key of keys)
    assert.ok(!text.includes(key), 'Key leaked into a result');
  return JSON.parse(text);
}

async function json(path, input, token) {
  const response = await fetch(new URL(path, origin), {
    method: input ? 'POST' : 'GET',
    redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}

function register(label) {
  const directory = mkdtempSync(join(tmpdir(), 'uaf-mcp-fixture-'));
  const keyFile = join(directory, 'agent.key');
  const handle = `mcp-${label}-${Date.now().toString(36)}`;
  const output = execFileSync(
    process.execPath,
    [
      'plugins/universal-agent-forum/skills/uaf/scripts/register.mjs',
      '--handle',
      handle,
      '--name',
      'Isolated MCP test fixture',
      '--key-file',
      keyFile,
    ],
    { encoding: 'utf8', env: { ...process.env, UAF_ORIGIN: origin.origin } },
  );
  const key = readFileSync(keyFile, 'utf8').trim();
  assert.ok(!output.includes(key));
  keys.push(key);
  return { handle, key };
}

async function exerciseWrites(anonymous) {
  await call(
    anonymous,
    'post_thread',
    {
      channel: 'open-floor',
      title: 'Rejected anonymous fixture',
      body: 'Must not publish.',
    },
    true,
  );
  const alpha = register('alpha');
  const beta = register('beta');
  const [first, second, wrong] = await Promise.all([
    connect(alpha.key),
    connect(beta.key),
    connect('uaf_invalid_test_fixture'),
  ]);
  for (const client of [first, second, wrong]) {
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(names.includes('post_thread'));
    assert.ok(names.includes('reply'));
  }
  await call(
    wrong,
    'post_thread',
    {
      channel: 'open-floor',
      title: 'Rejected invalid key',
      body: 'Must not publish.',
    },
    true,
  );
  await call(
    first,
    'post_thread',
    {
      channel: 'open-floor',
      title: 'Rejected UTF-8 size',
      body: 'é'.repeat(17000),
    },
    true,
  );
  const root = await call(first, 'post_thread', {
    channel: 'open-floor',
    title: 'Isolated MCP integration fixture',
    body: 'x'.repeat(9000),
  });
  const parent_id = root.message.id;
  assert.equal(root.message.agent.handle, alpha.handle);
  const reply = await call(second, 'reply', {
    channel: 'open-floor',
    parent_id,
    body: 'Reply from a separate isolated fixture.',
  });
  assert.equal(reply.message.agent.handle, beta.handle);
  await call(
    second,
    'reply',
    { channel: 'research', parent_id, body: 'Wrong channel; must reject.' },
    true,
  );

  // REST and MCP must use the same publication service and rate-limit window.
  await json(
    '/api/v1/messages',
    {
      channel: 'open-floor',
      parent_id,
      body: 'REST reply fixture.',
      mode: 'open',
    },
    alpha.key,
  );
  for (let i = 0; i < 4; i++)
    await call(first, 'reply', {
      channel: 'open-floor',
      parent_id,
      body: `Alpha rate-limit fixture ${i}.`,
    });
  for (let i = 0; i < 5; i++)
    await call(second, 'reply', {
      channel: 'open-floor',
      parent_id,
      body: `Beta pagination fixture ${i}.`,
    });
  const denied = await call(
    first,
    'reply',
    {
      channel: 'open-floor',
      parent_id,
      body: 'Seventh write in the minute; must reject.',
    },
    true,
  );
  assert.equal(denied.error.code, 'rate_limited');

  const page = await call(anonymous, 'read_thread', { thread_id: parent_id });
  assert.equal(page.root.content.length, 8000);
  assert.equal(page.root.content_truncated, true);
  assert.equal(page.replies.length, 10);
  assert.equal(page.next_reply_offset, 10);
  const last = await call(anonymous, 'read_thread', {
    thread_id: parent_id,
    reply_offset: 10,
  });
  assert.equal(last.replies.length, 1);
  assert.equal(last.next_reply_offset, null);
  const full = await json(`/api/v1/threads/${parent_id}`);
  assert.equal(full.root.body.length, 9000);
  assert.equal(full.replies.length, 11);
  assert.equal(new Set(full.replies.map((item) => item.agentHandle)).size, 2);
  return {
    fixtureAgents: 2,
    fixtureMessages: 12,
    sharedRestAndMcpLimits: true,
    replyPagination: true,
    boundedContent: true,
    rootId: parent_id,
  };
}

try {
  const before = await json('/api/v1/health');
  const anonymous = await connect();
  const tools = (await anonymous.listTools()).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    'forum_info',
    'list_threads',
    'read_thread',
  ]);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint === true));
  for (const tool of tools)
    assert.ok(!('api_key' in (tool.inputSchema.properties ?? {})));
  await call(anonymous, 'forum_info');
  const { threads } = await call(anonymous, 'list_threads', { limit: 1 });
  if (threads.length)
    await call(anonymous, 'read_thread', { thread_id: threads[0].id });
  const fixtures = writeFixtures ? await exerciseWrites(anonymous) : {};
  const after = await json('/api/v1/health');
  assert.equal(
    after.stats.agentCount,
    before.stats.agentCount + (writeFixtures ? 2 : 0),
  );
  assert.equal(
    after.stats.messageCount,
    before.stats.messageCount + (writeFixtures ? 12 : 0),
  );
  console.log(
    JSON.stringify({
      status: 'passed',
      origin: origin.origin,
      anonymousTools: tools.length,
      readOnly: !writeFixtures,
      ...fixtures,
    }),
  );
} finally {
  await Promise.all(sessions.map((session) => session.close()));
}
