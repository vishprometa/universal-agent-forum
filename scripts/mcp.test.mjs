import assert from 'node:assert/strict';
import test from 'node:test';
import { McpServer } from '@modelcontextprotocol/server';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { z } from 'zod';
import { createForumMcpEndpoint } from '../lib/mcp-http.mjs';

const origin = 'https://forum.example.org';

function fixture(t) {
  const writes = [];
  let factories = 0;
  const endpoint = createForumMcpEndpoint(({ requestInfo }) => {
    factories += 1;
    const server = new McpServer({ name: 'uaf-test', version: '1.0.0' });
    server.registerTool(
      'read',
      {
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true },
      },
      async () => ({ content: [{ type: 'text', text: 'public fixture' }] }),
    );
    server.registerTool(
      'write',
      {
        inputSchema: z.object({ body: z.string() }).strict(),
        annotations: { readOnlyHint: false, idempotentHint: false },
      },
      async ({ body }) => {
        const principal = {
          'Bearer uaf_fixture_alpha': 'alpha',
          'Bearer uaf_fixture_beta': 'beta',
        }[requestInfo.headers.get('authorization')];
        if (!principal)
          return {
            isError: true,
            content: [{ type: 'text', text: 'Agent key required' }],
          };
        writes.push({ principal, body });
        return { content: [{ type: 'text', text: 'published' }] };
      },
    );
    return server;
  }, origin);
  t.after(() => endpoint.close());
  const fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.headers.has('host'))
      request.headers.set('host', new URL(request.url).host);
    return endpoint.fetch(request);
  };
  return { endpoint, fetch, writes, factories: () => factories };
}

async function client(t, fixture, key) {
  const session = new Client({
    name: 'uaf-integration-test',
    version: '1.0.0',
  });
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', origin), {
    fetch: fixture.fetch,
    requestInit: key
      ? { headers: { Authorization: `Bearer ${key}` } }
      : undefined,
  });
  t.after(() => session.close());
  await session.connect(transport);
  return session;
}

await test('MCP SDK discovery and public reads require no credentials and never write', async (t) => {
  const f = fixture(t);
  const c = await client(t, f);
  const list = await c.listTools();
  assert.equal(list.tools.length, 2);
  assert.equal(
    list.tools.find((tool) => tool.name === 'write').annotations.readOnlyHint,
    false,
  );
  assert.match(
    JSON.stringify(await c.callTool({ name: 'read', arguments: {} })),
    /public fixture/,
  );
  assert.equal(
    (await c.callTool({ name: 'write', arguments: { body: 'not published' } }))
      .isError,
    true,
  );
  assert.equal(f.writes.length, 0);
});

await test('concurrent MCP callers retain their own header credentials and reject key arguments', async (t) => {
  const f = fixture(t);
  const [alpha, beta] = await Promise.all([
    client(t, f, 'uaf_fixture_alpha'),
    client(t, f, 'uaf_fixture_beta'),
  ]);
  const results = await Promise.all([
    alpha.callTool({ name: 'write', arguments: { body: 'first' } }),
    beta.callTool({ name: 'write', arguments: { body: 'second' } }),
  ]);
  assert.deepEqual(
    f.writes.toSorted((a, b) => a.principal.localeCompare(b.principal)),
    [
      { principal: 'alpha', body: 'first' },
      { principal: 'beta', body: 'second' },
    ],
  );
  assert.doesNotMatch(JSON.stringify(results), /uaf_fixture_/);
  const bad = await alpha.callTool({
    name: 'write',
    arguments: { body: 'rejected', api_key: 'must-not-be-an-argument' },
  });
  assert.equal(bad.isError, true);
  assert.equal(f.writes.length, 2);
});

await test('MCP request boundary rejects rebinding, foreign origins, invalid bodies and GET writes before constructing a server', async (t) => {
  const f = fixture(t);
  const base = {
    method: 'POST',
    headers: { Host: 'forum.example.org', 'Content-Type': 'application/json' },
    body: '{}',
  };
  const cases = [
    [{ ...base, headers: { ...base.headers, Host: 'evil.example' } }, 403],
    [
      { ...base, headers: { ...base.headers, Origin: 'https://evil.example' } },
      403,
    ],
    [{ ...base, headers: { ...base.headers, Origin: 'null' } }, 403],
    [
      { ...base, headers: { ...base.headers, 'Content-Type': 'text/plain' } },
      415,
    ],
    [{ ...base, body: '{invalid' }, 400],
    [{ ...base, body: 'x'.repeat(48001) }, 413],
    [{ ...base, headers: { ...base.headers, 'Content-Length': '48001' } }, 413],
    [{ method: 'GET', headers: base.headers }, 405],
  ];
  for (const [init, status] of cases) {
    const response = await f.fetch(origin + '/mcp', init);
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(f.factories(), 0);
  assert.equal(f.writes.length, 0);
});

await test('legacy 2025 initialize requests retain MCP compatibility without a server session', async (t) => {
  const f = fixture(t);
  const response = await f.fetch(origin + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'legacy-fixture', version: '1.0.0' },
      },
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('mcp-session-id'), null);
  assert.match(await response.text(), /"name":"uaf-test"/);
  assert.equal(f.writes.length, 0);
});
