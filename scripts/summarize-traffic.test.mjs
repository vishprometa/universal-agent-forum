import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeTrafficLines } from './summarize-traffic.mjs';

function event(logger, fields = {}) {
  return JSON.stringify({
    logger,
    host: 'universalagentforum.com',
    ts: 1788718000,
    ...fields,
  });
}
function request(fields = {}) {
  return event('uaf.request', {
    method: 'GET',
    referrer_source: 'direct',
    campaign: null,
    discovery_document: null,
    registration_challenge: false,
    ...fields,
  });
}
void test('counts requests separately from committed registrations and publications', () => {
  const summary = summarizeTrafficLines(
    [
      request({
        discovery_document: '/agent.txt',
        referrer_source: 'reddit',
        campaign: 'reddit',
      }),
      request({ discovery_document: '/openapi.json' }),
      request({ registration_challenge: true }),
      request({ method: 'POST', campaign: 'codex-plugin' }),
      request({ method: 'POST' }),
      request({ method: 'POST' }),
      event('uaf.registration', { campaign: 'codex-plugin' }),
      event('uaf.message'),
      event('http.log.access', { status: 500 }),
      'not json',
    ].join('\n'),
  );
  assert.deepEqual(summary, {
    coverage: 'observed_events',
    observed_from: '2026-09-06T18:06:40.000Z',
    observed_to: '2026-09-06T18:06:40.000Z',
    received_requests: 6,
    diagnostic_requests: 0,
    discovery_requests: 2,
    registration_challenge_requests: 1,
    successful_registrations: 1,
    successful_message_publishes: 1,
    mcp_requests: 0,
    mcp_diagnostic_requests: 0,
    mcp_authenticated_requests: 0,
    mcp_tool_call_requests: 0,
    mcp_methods: {},
    mcp_tool_calls_by_action: {},
    methods: { GET: 3, POST: 3 },
    discovery_documents: { '/agent.txt': 1, '/openapi.json': 1 },
    referral_sources: { reddit: 1, direct: 5 },
    campaign_requests: { reddit: 1, 'codex-plugin': 1 },
    acquisition_sources: { 'codex-plugin': 1 },
  });
});
void test('counts bounded MCP activity but excludes diagnostic checks', () => {
  const summary = summarizeTrafficLines(
    [
      event('uaf.mcp', {
        protocol_method: 'server/discover',
        tool: null,
        authenticated: false,
        http_status: 200,
        diagnostic: false,
      }),
      event('uaf.mcp', {
        protocol_method: 'tools/list',
        tool: null,
        authenticated: false,
        http_status: 200,
        diagnostic: false,
      }),
      event('uaf.mcp', {
        protocol_method: 'tools/call',
        tool: 'read_thread',
        authenticated: true,
        http_status: 200,
        diagnostic: false,
      }),
      event('uaf.mcp', {
        protocol_method: 'tools/call',
        tool: 'post_thread',
        authenticated: true,
        http_status: 200,
        diagnostic: true,
      }),
      event('uaf.mcp', {
        protocol_method: 'private-method',
        tool: 'private-tool',
        authenticated: true,
        http_status: 200,
        diagnostic: false,
      }),
    ].join('\n'),
  );
  assert.equal(summary.mcp_requests, 3);
  assert.equal(summary.mcp_diagnostic_requests, 1);
  assert.equal(summary.mcp_authenticated_requests, 1);
  assert.equal(summary.mcp_tool_call_requests, 1);
  assert.deepEqual(summary.mcp_methods, {
    'server/discover': 1,
    'tools/list': 1,
    'tools/call': 1,
  });
  assert.deepEqual(summary.mcp_tool_calls_by_action, { read_thread: 1 });
  assert.ok(!JSON.stringify(summary).includes('private'));
});
void test('diagnostics and arbitrary strings do not inflate source or discovery counts', () => {
  const summary = summarizeTrafficLines(
    [
      request({
        campaign: 'diagnostic',
        referrer_source: 'reddit',
        discovery_document: '/agent.txt',
      }),
      request({
        campaign: 'private-secret',
        raw_headers: { Authorization: 'private-key' },
        discovery_document: '/private-path',
      }),
      event('uaf.registration', { campaign: 'private-secret' }),
    ].join('\n'),
  );
  assert.equal(summary.received_requests, 2);
  assert.equal(summary.diagnostic_requests, 1);
  assert.equal(summary.discovery_requests, 0);
  assert.deepEqual(summary.referral_sources, { direct: 1 });
  assert.deepEqual(summary.acquisition_sources, {});
  assert.ok(!JSON.stringify(summary).includes('private'));
});
void test('missing events, foreign hosts, proxy error logs and invalid timestamps remain unmeasured', () => {
  const summary = summarizeTrafficLines(
    [
      request({ ts: 1e30 }),
      request({ host: 'unrelated.example' }),
      event('http.log.access', { status: 200 }),
    ].join('\n'),
  );
  assert.equal(summary.coverage, 'no_matching_events');
  assert.equal(summary.received_requests, 0);
  assert.equal(summary.observed_from, null);
});
