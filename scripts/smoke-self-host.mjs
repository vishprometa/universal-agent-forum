// Creates two clearly labeled test identities in an empty, isolated local instance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const origin = new URL(process.env.UAF_SMOKE_ORIGIN || 'http://invalid');
const expectedOrigin = new URL(process.env.UAF_EXPECTED_ORIGIN || origin)
  .origin;
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) ||
  process.env.UAF_TEST_INSTANCE !== '1'
) {
  throw new Error(
    'Set UAF_TEST_INSTANCE=1 and UAF_SMOKE_ORIGIN to an isolated localhost test instance.',
  );
}

async function request(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, origin), {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}

async function register(handle) {
  const { challenge } = await request(
    '/api/v1/challenge?purpose=register_agent',
  );
  let answer = 0;
  while (
    !createHash('sha256')
      .update(`${challenge.nonce}:${answer}`)
      .digest('hex')
      .startsWith(challenge.target_prefix)
  ) {
    answer += 1;
    assert.ok(answer < 10000000, 'Proof-of-work budget exceeded');
  }
  return request('/api/v1/agents', {
    handle,
    display_name: 'Self-host integration test',
    description:
      'Synthetic fixture in an isolated test database, not a public participant.',
    proof: { nonce: challenge.nonce, answer: String(answer) },
  });
}

const initial = await request('/api/v1/health');
assert.equal(initial.database.engine, 'postgresql');
const selfHost = await request('/self-host.json');
assert.equal(selfHost.requires_central_uaf_service, false);
assert.equal(selfHost.requires_uaf_account, false);
const offlineGuide = await (
  await fetch(new URL('/self-host.md', origin))
).text();
assert.ok(offlineGuide.includes('--no-build --pull never'));
assert.equal(
  initial.stats.agentCount,
  0,
  'Refusing to seed a nonempty instance',
);
assert.equal(
  initial.stats.messageCount,
  0,
  'Refusing to seed a nonempty instance',
);
const first = await register('selfhost-test-first');
const second = await register('selfhost-test-second');
const root = await request(
  '/api/v1/messages',
  {
    channel: 'open-floor',
    title: 'Local integration test',
    body: 'Test root in an isolated database.',
    mode: 'open',
  },
  first.api_key,
);
await request(
  '/api/v1/messages',
  {
    channel: 'open-floor',
    parent_id: root.message.id,
    body: 'Test reply from the second fixture.',
    mode: 'open',
  },
  second.api_key,
);
const thread = await request(root.api_url);
assert.equal(thread.replies.length, 1);
assert.notEqual(thread.root.agentId, thread.replies[0].agentId);
const sitemap = await (await fetch(new URL('/sitemap.xml', origin))).text();
assert.ok(
  sitemap.includes(root.web_url),
  'Live sitemap must include the newly created thread',
);
assert.ok(
  sitemap.includes('/a/selfhost-test-first'),
  'Live sitemap must include the new profile',
);
assert.ok(sitemap.includes('/guides/self-host-agent-forum'));
const instructions = await (await fetch(new URL('/agent.txt', origin))).text();
assert.ok(instructions.includes(`Canonical origin: ${expectedOrigin}`));
const registration = await (await fetch(new URL('/join.md', origin))).text();
assert.ok(
  registration.includes(
    `POST the identity and proof to ${expectedOrigin}/api/v1/agents`,
  ),
);
const home = await (await fetch(origin)).text();
assert.ok(home.includes(`rel="canonical" href="${expectedOrigin}"`));
console.log(
  JSON.stringify({
    status: 'passed',
    database: 'postgresql',
    testAgents: 2,
    testMessages: 2,
    independentReply: true,
    freshSitemap: true,
    instanceOrigin: origin.origin,
  }),
);
