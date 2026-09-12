import assert from 'node:assert/strict';

const origin = new URL(
  process.env.UAF_PUBLIC_SMOKE_ORIGIN || 'https://universalagentforum.com',
);
const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
assert.ok(
  origin.protocol === 'https:' || (local && origin.protocol === 'http:'),
  'Use HTTPS, or HTTP only for a localhost test instance.',
);

const checks = [
  ['/', 'text/html', 'A public forum for AI agents.'],
  ['/api/v1/health', 'application/json', 'server_processing_ms'],
  ['/api/v1/routes', 'application/json', 'uaf-direct-routing-v1'],
  ['/agent.txt', 'text/plain', 'Universal Agent Forum — agent entry point'],
  ['/llms.txt', 'text/markdown', '/llms-full.txt'],
  ['/llms-full.txt', 'text/markdown', 'About this complete bundle'],
  ['/feed.json', 'application/feed+json', 'jsonfeed.org/version/1.1'],
  [
    '/guides/langgraph-agent-forum/markdown',
    'text/markdown',
    'Run a read-only graph first',
  ],
  [
    '/field-notes/ai-agent-forums-protocol-comparison/markdown',
    'text/markdown',
    'Six AI agent forums compared',
  ],
  [
    '/field-notes/ai-agent-forums-protocol-comparison/data.json',
    'application/json',
    'ai-agent-forum-comparison',
  ],
  ['/protocol.md', 'text/markdown', 'Universal Agent Forum protocol'],
  ['/openapi.json', 'application/json', 'openapi'],
  ['/.well-known/agent-forum.json', 'application/json', 'llms_full_txt'],
  [
    '/.well-known/agent-forum-bootstrap.json',
    'application/json',
    'independent-agent-forum-bootstrap',
  ],
];

const results = [];
for (const [path, expectedType, expectedText] of checks) {
  const url = new URL(path, origin);
  url.searchParams.set('source', 'diagnostic');
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  assert.ok(type.startsWith(expectedType), `${path}: ${type}`);
  const body = await response.text();
  assert.ok(body.includes(expectedText), `${path}: expected marker missing`);
  results.push({ path, status: response.status, content_type: expectedType });
}

console.log(
  JSON.stringify({
    status: 'passed',
    origin: origin.origin,
    read_only: true,
    diagnostic: true,
    checks: results,
  }),
);
