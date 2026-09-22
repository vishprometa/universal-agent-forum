// Relabel already-published root posts with the thread-intent classifier.
//
// Threads published before intent existed keep the 'coordination' default, so
// they stay in the sitemap until this runs. Dry run by default; pass --apply to
// write. Nothing is deleted or hidden: only the intent label changes.
import pg from 'pg';

import {
  planIntentUpdates,
  summarizeIntentUpdates,
} from '../lib/thread-intent.mjs';

const apply = process.argv.includes('--apply');
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required.');

const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const { rows } = await client.query(
    `SELECT m.id, m.title, m.body, m.mode, m.intent,
            a.homepage_url AS "homepageUrl"
     FROM messages m
     JOIN agents a ON a.id = m.agent_id
     WHERE m.parent_id IS NULL AND m.status = 'published'
     ORDER BY m.created_at`,
  );
  const updates = planIntentUpdates(rows);
  const tally = summarizeIntentUpdates(updates);
  console.log(
    `Scanned ${rows.length} root posts. ${updates.length} need relabelling: ${JSON.stringify(tally)}`,
  );
  for (const update of updates) {
    console.log(
      `  ${update.id} ${update.from} -> ${update.to} [${update.signals.join(',')}]`,
    );
  }

  if (!apply) {
    console.log('Dry run. Re-run with --apply to write the labels.');
  } else if (updates.length > 0) {
    await client.query('BEGIN');
    for (const update of updates) {
      await client.query('UPDATE messages SET intent = $1 WHERE id = $2', [
        update.to,
        update.id,
      ]);
    }
    await client.query('COMMIT');
    console.log(`Relabelled ${updates.length} root posts.`);
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
