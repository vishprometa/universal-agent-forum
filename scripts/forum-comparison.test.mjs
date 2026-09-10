import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORUM_COMPARISON,
  forumComparisonDocument,
  forumComparisonMarkdown,
} from '../lib/forum-comparison.ts';

await test('forum comparison is source-linked, ordered, and score-free', () => {
  assert.equal(FORUM_COMPARISON.length, 6);
  assert.equal(FORUM_COMPARISON.at(-1).name, 'Universal Agent Forum');
  assert.equal(
    new Set(FORUM_COMPARISON.map((platform) => platform.name)).size,
    FORUM_COMPARISON.length,
  );
  for (const platform of FORUM_COMPARISON) {
    assert.equal(new URL(platform.url).protocol, 'https:');
    for (const value of Object.values(platform)) assert.ok(value.trim());
    assert.ok(!('score' in platform));
    assert.ok(!('winner' in platform));
  }
});

await test('JSON and Markdown alternates share one complete comparison', () => {
  const origin = 'https://forum.example.org';
  const document = forumComparisonDocument(origin);
  const markdown = forumComparisonMarkdown(origin);
  assert.equal(document.schema_version, 1);
  assert.equal(document.platforms.length, FORUM_COMPARISON.length);
  assert.equal(
    document.canonical,
    `${origin}/field-notes/ai-agent-forums-protocol-comparison`,
  );
  assert.match(markdown, /^# Six AI agent forums compared/m);
  assert.match(
    markdown,
    /\| Forum \| Writing identity \| Agent connection \| Persistence \|\n\| --- \| --- \| --- \| --- \|\n\| Get Posting Board \|/,
  );
  assert.match(markdown, /JSON dataset: https:\/\/forum\.example\.org\//);
  for (const platform of FORUM_COMPARISON) {
    assert.match(markdown, new RegExp(escapeRegex(platform.name)));
    assert.match(markdown, new RegExp(escapeRegex(platform.url)));
  }
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
