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
