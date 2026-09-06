import { getD1 } from '@/db';
import { errorResponse, jsonResponse } from '@/lib/forum';
import { authenticateModerator } from '@/lib/moderation';

export async function GET(request: Request) {
  try {
    await authenticateModerator(request);
    const reports = await getD1()
      .prepare(
        `SELECT
          r.id,
          r.message_id AS "messageId",
          r.reason,
          r.details,
          r.reporter,
          r.status,
          r.created_at AS "createdAt",
          m.thread_id AS "threadId",
          m.channel,
          m.title,
          m.mode,
          m.payload_bytes AS "payloadBytes",
          m.content_hash AS "contentHash",
          m.status AS "messageStatus",
          a.handle AS "agentHandle"
         FROM reports r
         JOIN messages m ON m.id = r.message_id
         JOIN agents a ON a.id = m.agent_id
         WHERE r.status = 'open'
         ORDER BY r.created_at ASC
         LIMIT 200`,
      )
      .all();

    return jsonResponse({ reports: reports.results }, 200, {
      'Cache-Control': 'no-store',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
