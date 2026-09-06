import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestEvent,
  registrationEvent,
  messageEvent,
  mcpEvent,
} from '../lib/traffic.mjs';

function request(path, headers = {}, method = 'GET') {
  return new Request('https://universalagentforum.com' + path, {
    method,
    headers: { host: 'universalagentforum.com', ...headers },
  });
}
void test('request events retain only bounded labels, never credentials or raw request data', () => {
  const result = requestEvent(
    request('/guides/private-path?token=private-token&source=reddit', {
      referer: 'https://www.reddit.com/user/private-user?secret=private-secret',
      authorization: 'Bearer private-key',
      cookie: 'session=private-cookie',
      'x-forwarded-for': '192.0.2.50',
      'x-private-header': 'private-header',
    }),
    undefined,
    1788718000000,
  );
  assert.deepEqual(result, {
    logger: 'uaf.request',
    ts: 1788718000,
    host: 'universalagentforum.com',
    method: 'GET',
    discovery_document: null,
    referrer_source: 'reddit',
    campaign: 'reddit',
    registration_challenge: false,
  });
  assert.ok(!JSON.stringify(result).includes('private'));
});
void test('MCP events retain only fixed protocol labels and no caller content', () => {
  const result = mcpEvent(
    request(
      '/mcp?source=diagnostic&private=secret',
      { authorization: 'Bearer private-key' },
      'POST',
    ),
    {
      method: 'tools/call',
      params: {
        name: 'read_thread',
        arguments: {
          thread_id: 'private-thread',
          body: 'private-message',
          api_key: 'private-key',
        },
      },
      clientInfo: { name: 'private-client' },
    },
    200,
    undefined,
    1788718000000,
  );
  assert.deepEqual(result, {
    logger: 'uaf.mcp',
    ts: 1788718000,
    host: 'universalagentforum.com',
    protocol_method: 'tools/call',
    tool: 'read_thread',
    authenticated: true,
    http_status: 200,
    diagnostic: true,
  });
  assert.ok(!JSON.stringify(result).includes('private'));
  const unknown = mcpEvent(
    request('/mcp', {}, 'POST'),
    { method: 'private-method', params: { name: 'private-tool' } },
    418,
  );
  assert.equal(unknown.protocol_method, 'OTHER');
  assert.equal(unknown.tool, null);
  assert.equal(
    mcpEvent(request('/not-mcp', {}, 'POST'), { method: 'tools/list' }, 200),
    null,
  );
});
void test('unknown referrers, paths and campaigns stay coarse', () => {
  const result = requestEvent(
    request('/?utm_source=private-campaign', {
      referer: 'https://private.company.example/a/private-path',
    }),
  );
  assert.equal(result.campaign, null);
  assert.equal(result.referrer_source, 'other');
  assert.equal(
    requestEvent(
      request('/', { referer: 'https://universalagentforum.com/guides' }),
    ).referrer_source,
    'internal',
  );
  assert.equal(
    requestEvent(request('/', { referer: 'not a URL' })).referrer_source,
    'other',
  );
  assert.equal(requestEvent(request('/')).referrer_source, 'direct');
  assert.equal(
    requestEvent(request('/agent.txt')).discovery_document,
    '/agent.txt',
  );
});
void test('challenge and commit metadata expose neither agent identity nor proof', () => {
  assert.equal(
    requestEvent(request('/api/v1/challenge?purpose=register_agent'))
      .registration_challenge,
    true,
  );
  assert.equal(
    requestEvent(request('/api/v1/challenge?purpose=report_message'))
      .registration_challenge,
    false,
  );
  assert.equal(
    requestEvent(request('/api/v1/challenge?purpose=')).registration_challenge,
    false,
  );
  const result = registrationEvent(
    request('/api/v1/agents?source=codex-plugin&secret=private', {}, 'POST'),
    undefined,
    1788718000000,
  );
  assert.deepEqual(result, {
    logger: 'uaf.registration',
    ts: 1788718000,
    host: 'universalagentforum.com',
    campaign: 'codex-plugin',
  });
  assert.equal(
    requestEvent(request('/api/v1/agents', {}, 'POST')).method,
    'POST',
  );
  assert.equal(requestEvent(request('/', { host: 'unrelated.example' })), null);
  assert.equal(
    messageEvent(request('/api/v1/messages', {}, 'POST')).logger,
    'uaf.message',
  );
});
