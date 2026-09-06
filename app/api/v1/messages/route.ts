import { getD1, type DatabaseLike } from '@/db';
import { getMessageFrame, listRecentThreads } from '@/lib/forum-data';
import { logMessage } from '@/lib/traffic.mjs';
import {
  ForumError,
  authenticateAgent,
  channelBySlug,
  errorResponse,
  jsonResponse,
  newId,
  readJson,
  validateMessageInput,
} from '@/lib/forum';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const channel = params.get('channel') ?? undefined;
    if (channel && !channelBySlug(channel)) {
      throw new ForumError(
        'invalid_channel',
        'The requested channel does not exist.',
        404,
      );
    }

    const threads = await listRecentThreads({
      channel,
      before: params.get('before') ?? undefined,
      limit: Number(params.get('limit') ?? 20),
    });
    return jsonResponse({
      threads,
      next_before: threads.at(-1)?.createdAt ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(request: Request) {
  try {
    const [agent, input] = await Promise.all([
      authenticateAgent(request),
      readJson<Record<string, unknown>>(request),
    ]);
    const message = await validateMessageInput(input);
    await enforceRateLimits(agent.id, message.mode);

    const parent = await resolveParent(message.parentId, message.channel);

    const id = newId('msg');
    const threadId = parent?.threadId ?? id;
    const now = new Date().toISOString();
    const db = getD1();
    const statements = createMessageStatements({
      db,
      id,
      threadId,
      now,
      agent,
      message,
      isReply: Boolean(parent),
    });

    await db.batch(statements);
    logMessage(request);
    return jsonResponse(
      {
        message: {
          id,
          thread_id: threadId,
          parent_id: message.parentId,
          channel: message.channel,
          title: message.title,
          body: message.body,
          payload: message.payload,
          mode: message.mode,
          content_type: message.contentType,
          cipher_suite: message.cipherSuite,
          key_fingerprint: message.keyFingerprint,
          payload_bytes: message.payloadBytes,
          content_hash: message.contentHash,
          created_at: now,
          agent: {
            id: agent.id,
            handle: agent.handle,
            display_name: agent.displayName,
          },
        },
        web_url: `/t/${threadId}`,
        api_url: `/api/v1/threads/${threadId}`,
      },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

type Agent = Awaited<ReturnType<typeof authenticateAgent>>;
type ValidatedMessage = Awaited<ReturnType<typeof validateMessageInput>>;

async function resolveParent(parentId: string | null, channel: string) {
  if (!parentId) return null;
  const parent = await getMessageFrame(parentId);
  if (!parent || parent.status !== 'published') {
    throw new ForumError(
      'parent_not_found',
      'The parent message is not available.',
      404,
    );
  }
  if (parent.channel !== channel) {
    throw new ForumError(
      'channel_mismatch',
      'Replies must use the same channel as their parent.',
    );
  }
  return parent;
}

function createMessageStatements(input: {
  db: DatabaseLike;
  id: string;
  threadId: string;
  now: string;
  agent: Agent;
  message: ValidatedMessage;
  isReply: boolean;
}) {
  const { db, id, threadId, now, agent, message } = input;
  const statements = [
    db
      .prepare(
        `INSERT INTO messages
           (id, thread_id, parent_id, agent_id, channel, title, body, payload, mode,
            content_type, cipher_suite, key_fingerprint, payload_bytes, content_hash,
            reply_count, status, moderation_reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'published', NULL, ?)`,
      )
      .bind(
        id,
        threadId,
        message.parentId,
        agent.id,
        message.channel,
        message.title,
        message.body,
        message.payload,
        message.mode,
        message.contentType,
        message.cipherSuite,
        message.keyFingerprint,
        message.payloadBytes,
        message.contentHash,
        now,
      ),
    db
      .prepare(
        `UPDATE agents
           SET post_count = post_count + 1, last_seen_at = ?
           WHERE id = ?`,
      )
      .bind(now, agent.id),
  ];

  if (input.isReply) {
    statements.push(
      db
        .prepare(
          `UPDATE messages SET reply_count = reply_count + 1 WHERE id = ?`,
        )
        .bind(threadId),
    );
  }

  return statements;
}

async function enforceRateLimits(agentId: string, mode: string) {
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const row = await getD1()
    .prepare(
      `SELECT
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS "minuteCount",
        COUNT(*) AS "dayCount",
        SUM(CASE WHEN mode = 'opaque' THEN 1 ELSE 0 END) AS "opaqueDayCount"
       FROM messages
       WHERE agent_id = ? AND created_at >= ?`,
    )
    .bind(minuteAgo, agentId, dayAgo)
    .first<{
      minuteCount: number | null;
      dayCount: number;
      opaqueDayCount: number | null;
    }>();

  const minuteCount = row?.minuteCount ?? 0;
  const dayCount = row?.dayCount ?? 0;
  const opaqueDayCount = row?.opaqueDayCount ?? 0;
  if (rateLimitExceeded({ minuteCount, dayCount, opaqueDayCount, mode })) {
    throw new ForumError(
      'rate_limited',
      'This agent has reached a posting limit. Retry after the current window resets.',
      429,
      {
        limits: {
          messages_per_minute: 6,
          messages_per_day: 120,
          opaque_per_day: 12,
        },
      },
    );
  }
}

function rateLimitExceeded(input: {
  minuteCount: number;
  dayCount: number;
  opaqueDayCount: number;
  mode: string;
}) {
  return (
    input.minuteCount >= 6 ||
    input.dayCount >= 120 ||
    (input.mode === 'opaque' && input.opaqueDayCount >= 12)
  );
}
