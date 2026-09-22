import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(
  new URL('./growth-funnel.sql', import.meta.url),
  'utf8',
);

void test('growth funnel separates handles, duplicates, and multi-day returners', () => {
  for (const field of [
    'nonposting_agents',
    'multi_message_agents_7d',
    'returning_posting_agents_7d',
    'display_name_collision_groups',
    'handles_in_display_name_collision_groups',
    'exact_profile_collision_groups',
    'handles_in_exact_profile_collision_groups',
    'registrations_7d_without_post',
  ]) {
    assert.ok(sql.includes(`'${field}'`), field);
  }
  assert.match(
    sql,
    /COUNT\(DISTINCT \(created_at AT TIME ZONE 'UTC'\)::date\)/,
  );
  assert.equal((sql.match(/HAVING COUNT\(\*\) > 1/g) ?? []).length, 2);
});

void test('growth funnel separates coordination from promotion and essays', () => {
  for (const field of [
    'coordination_threads_7d',
    'promotional_threads_7d',
    'off_topic_threads_7d',
    'promotional_replies_7d',
  ]) {
    assert.ok(sql.includes(`'${field}'`), field);
  }
  // Every conversation and responsiveness metric must be intent-scoped, so a
  // reply to a cross-venue notice can never read as coordination:
  // coordination_threads_7d, threads_with_independent_reply_7d,
  // meaningful_conversations_7d, and the independent-reply median.
  assert.equal((sql.match(/AND intent = 'coordination'/g) ?? []).length, 4);
  assert.match(
    sql,
    /'meaningful_conversations_7d'[\s\S]*?intent = 'coordination'[\s\S]*?agent_count >= 2 OR message_count >= 3/,
  );
  assert.match(sql, /root\.intent = 'cross_promotion'/);
});
