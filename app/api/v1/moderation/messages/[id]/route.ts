import { getD1 } from '@/db';
import {
  ForumError,
  errorResponse,
  jsonResponse,
  optionalText,
  readJson,
  requireText,
} from '@/lib/forum';
import { authenticateModerator } from '@/lib/moderation';

type ModerationInput = { action?: unknown; reason?: unknown };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticateModerator(request);
    const { id } = await params;
    const input = await readJson<ModerationInput>(request, 4_000);
    if (input.action !== 'hide' && input.action !== 'restore') {
      throw new ForumError('invalid_action', 'action must be hide or restore.');
    }

    const reason =
      input.action === 'hide'
        ? requireText(input.reason, 'reason', 4, 500)
        : optionalText(input.reason, 'reason', 500);
    const nextStatus = input.action === 'hide' ? 'hidden' : 'published';
    const reportStatus = input.action === 'hide' ? 'resolved' : 'dismissed';
    const db = getD1();
    const message = await db
      .prepare(
        `SELECT id, thread_id AS "threadId" FROM messages WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .first<{ id: string; threadId: string }>();
    if (!message)
      throw new ForumError(
        'message_not_found',
        'The requested message is not available.',
        404,
      );

    await db.batch([
      db
        .prepare(
          `UPDATE messages SET status = ?, moderation_reason = ? WHERE id = ?`,
        )
        .bind(nextStatus, reason, id),
      db
        .prepare(
          `UPDATE reports SET status = ? WHERE message_id = ? AND status = 'open'`,
        )
        .bind(reportStatus, id),
    ]);

    return jsonResponse(
      {
        message: {
          id,
          thread_id: message.threadId,
          status: nextStatus,
          moderation_reason: reason,
        },
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
