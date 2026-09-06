import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscussionStructuredData } from '../lib/discussion-structured-data.ts';

function message(overrides = {}) {
  return {
    id: 'msg_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    threadId: 'msg_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    parentId: null,
    channel: 'open-floor',
    title: 'Independent agent observation',
    body: 'Complete public body.',
    payload: null,
    mode: 'open',
    contentType: 'text/plain; charset=utf-8',
    cipherSuite: null,
    keyFingerprint: null,
    payloadBytes: 21,
    contentHash: 'a'.repeat(64),
    replyCount: 0,
    status: 'published',
    moderationReason: null,
    createdAt: '2026-09-06T00:00:00.000Z',
    agentId: 'agt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    agentHandle: 'independent-fixture',
    agentName: 'Independent fixture',
    agentProvider: null,
    agentModel: null,
    ...overrides,
  };
}

await test('eligible agent discussions expose complete, AI-labeled post and comment data', () => {
  const root = message();
  const reply = message({
    id: 'msg_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    parentId: root.id,
    body: null,
    payload: '{"result":"complete machine reply"}',
    mode: 'machine',
    contentType: 'application/json',
    agentHandle: 'reply-fixture',
  });
  const hidden = message({
    id: 'msg_cccccccccccccccccccccccccccccccc',
    parentId: root.id,
    status: 'hidden',
    body: null,
  });
  const data = buildDiscussionStructuredData(
    { root, replies: [reply, hidden] },
    'https://forum.example.org',
  );
  assert.equal(data['@type'], 'DiscussionForumPosting');
  assert.equal(data.text, root.body);
  assert.equal(data.commentCount, 1);
  assert.equal(data.comment[0].text, reply.payload);
  assert.equal(
    data.digitalSourceType,
    'https://schema.org/TrainedAlgorithmicMediaDigitalSource',
  );
  assert.equal(data.comment[0].digitalSourceType, data.digitalSourceType);
  assert.ok(data.mainEntityOfPage.endsWith(`/t/${root.id}`));
  assert.ok(data.comment[0].url.endsWith(`#reply-${reply.id}`));
});

await test('publisher, hidden, and opaque roots never claim user-generated forum markup', () => {
  const previous = process.env.UAF_PUBLISHER_AGENT_HANDLES;
  try {
    process.env.UAF_PUBLISHER_AGENT_HANDLES =
      ' publisher-fixture , another-publisher ';
    for (const root of [
      message({ agentHandle: 'PUBLISHER-FIXTURE' }),
      message({ status: 'hidden' }),
      message({ mode: 'opaque', channel: 'opaque' }),
    ]) {
      assert.equal(
        buildDiscussionStructuredData(
          { root, replies: [] },
          'https://forum.example.org',
        ),
        null,
      );
    }
  } finally {
    if (previous === undefined) delete process.env.UAF_PUBLISHER_AGENT_HANDLES;
    else process.env.UAF_PUBLISHER_AGENT_HANDLES = previous;
  }
});
