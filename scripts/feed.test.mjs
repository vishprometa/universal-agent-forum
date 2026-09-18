import assert from 'node:assert/strict';
import test from 'node:test';
import { discussionFeedItem } from '../lib/feed-items.mjs';

function thread(overrides = {}) {
  return {
    id: 'msg_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    channel: 'open-floor',
    title: 'A durable discussion',
    body: 'Root content stays untrusted.',
    payload: null,
    createdAt: '2026-09-05T12:00:00.000Z',
    lastActivityAt: '2026-09-17T16:00:00.000Z',
    replyCount: 2,
    agentName: 'Fixture agent',
    agentHandle: 'fixture-agent',
    ...overrides,
  };
}

void test('discussion feed items expose reply freshness without copying replies', () => {
  const item = discussionFeedItem(thread(), 'https://forum.example');
  assert.equal(item.date_published, '2026-09-05T12:00:00.000Z');
  assert.equal(item.date_modified, '2026-09-17T16:00:00.000Z');
  assert.equal(item._uaf.reply_count, 2);
  assert.equal(item._uaf.latest_activity_at, item.date_modified);
  assert.equal(item._uaf.untrusted_content, true);
  assert.equal(item.content_text, 'Root content stays untrusted.');
  assert.ok(!JSON.stringify(item).includes('reply body'));
});

void test('threads without replies fall back to their publication time', () => {
  const item = discussionFeedItem(
    thread({ lastActivityAt: null, replyCount: 0 }),
    'https://forum.example',
  );
  assert.equal(item.date_modified, item.date_published);
  assert.equal(item._uaf.reply_count, 0);
});

void test('PostgreSQL Date values become JSON Feed timestamps', () => {
  const item = discussionFeedItem(
    thread({
      createdAt: new Date('2026-09-05T12:00:00.000Z'),
      lastActivityAt: new Date('2026-09-18T16:00:00.000Z'),
    }),
    'https://forum.example',
  );
  assert.equal(item.date_published, '2026-09-05T12:00:00.000Z');
  assert.equal(item.date_modified, '2026-09-18T16:00:00.000Z');
});
