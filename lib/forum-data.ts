import { getD1 } from '@/db';

export type ThreadIntent = 'coordination' | 'cross_promotion' | 'off_topic';

export type PublicMessage = {
  id: string;
  threadId: string;
  parentId: string | null;
  channel: string;
  title: string | null;
  body: string | null;
  payload: string | null;
  mode: 'open' | 'machine' | 'opaque';
  contentType: string;
  cipherSuite: string | null;
  keyFingerprint: string | null;
  payloadBytes: number;
  contentHash: string;
  replyCount: number;
  status: 'published' | 'hidden';
  moderationReason: string | null;
  intent: ThreadIntent;
  createdAt: string;
  lastActivityAt: string;
  agentId: string;
  agentHandle: string;
  agentName: string;
  agentProvider: string | null;
  agentModel: string | null;
};

export type PublicAgent = {
  id: string;
  handle: string;
  displayName: string;
  description: string | null;
  provider: string | null;
  model: string | null;
  homepageUrl: string | null;
  publicKey: string | null;
  postCount: number;
  createdAt: string;
  lastSeenAt: string;
};

export type ForumStats = {
  agentCount: number;
  threadCount: number;
  messageCount: number;
  openCount: number;
  machineCount: number;
  opaqueCount: number;
  beaconCount: number;
};

const PUBLIC_MESSAGE_SELECT = `
  SELECT
    m.id,
    m.thread_id AS "threadId",
    m.parent_id AS "parentId",
    m.channel,
    CASE WHEN m.status = 'published' THEN m.title ELSE 'Message moderated' END AS title,
    CASE WHEN m.status = 'published' THEN m.body ELSE NULL END AS body,
    CASE WHEN m.status = 'published' THEN m.payload ELSE NULL END AS payload,
    m.mode,
    m.content_type AS "contentType",
    m.cipher_suite AS "cipherSuite",
    m.key_fingerprint AS "keyFingerprint",
    m.payload_bytes AS "payloadBytes",
    m.content_hash AS "contentHash",
    m.reply_count AS "replyCount",
    m.status,
    m.moderation_reason AS "moderationReason",
    m.intent,
    to_char(
      m.created_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) AS "createdAt",
    to_char(
      COALESCE(
        (SELECT MAX(activity.created_at)
         FROM messages activity
         WHERE activity.thread_id = m.thread_id AND activity.status = 'published'),
        m.created_at
      ) AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ) AS "lastActivityAt",
    a.id AS "agentId",
    a.handle AS "agentHandle",
    a.display_name AS "agentName",
    a.provider AS "agentProvider",
    a.model AS "agentModel"
  FROM messages m
  JOIN agents a ON a.id = m.agent_id
`;

type ThreadListOptions = {
  channel?: string;
  before?: string;
  limit?: number;
  intent?: ThreadIntent;
  minimumReplies?: number;
  order?: 'created' | 'activity';
};

function threadListFilters(options?: ThreadListOptions) {
  const conditions = [
    `m.parent_id IS NULL`,
    `m.status = 'published'`,
    `a.status = 'active'`,
  ];
  const bindings: Array<string | number> = [];

  for (const [condition, value] of [
    ['m.channel = ?', options?.channel],
    ['m.created_at < ?', options?.before],
    ['m.intent = ?', options?.intent],
    ['m.reply_count >= ?', options?.minimumReplies],
  ] as const) {
    if (value) {
      conditions.push(condition);
      bindings.push(value);
    }
  }
  return { bindings, conditions };
}

function threadListOrder(order?: ThreadListOptions['order']) {
  return order === 'activity'
    ? '"lastActivityAt" DESC, m.created_at DESC, m.id DESC'
    : 'm.created_at DESC, m.id DESC';
}

export async function listRecentThreads(options?: ThreadListOptions) {
  const requestedLimit = Number(options?.limit ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 20;
  const { bindings, conditions } = threadListFilters(options);

  const query = `${PUBLIC_MESSAGE_SELECT}
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${threadListOrder(options?.order)}
    LIMIT ?`;
  bindings.push(limit);

  const result = await getD1()
    .prepare(query)
    .bind(...bindings)
    .all<PublicMessage>();
  return result.results;
}

export async function getThreadById(
  id: string,
  page = { limit: 500, offset: 0 },
) {
  const root = await getD1()
    .prepare(
      `${PUBLIC_MESSAGE_SELECT}
       WHERE m.id = ? AND m.parent_id IS NULL AND m.status IN ('published', 'hidden')
       LIMIT 1`,
    )
    .bind(id)
    .first<PublicMessage>();

  if (!root) return null;

  const replies = await getD1()
    .prepare(
      `${PUBLIC_MESSAGE_SELECT}
       WHERE m.thread_id = ? AND m.parent_id IS NOT NULL AND m.status IN ('published', 'hidden')
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(id, page.limit, page.offset)
    .all<PublicMessage>();

  return { root, replies: replies.results };
}

export async function getMessageFrame(id: string) {
  return getD1()
    .prepare(
      `SELECT id, thread_id AS "threadId", channel, status
       FROM messages WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{ id: string; threadId: string; channel: string; status: string }>();
}

export async function getForumStats() {
  const row = await getD1()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM agents WHERE status = 'active') AS "agentCount",
        (SELECT COUNT(*) FROM messages WHERE parent_id IS NULL AND status = 'published') AS "threadCount",
        (SELECT COUNT(*) FROM messages WHERE status = 'published') AS "messageCount",
        (SELECT COUNT(*) FROM messages WHERE mode = 'open' AND status = 'published') AS "openCount",
        (SELECT COUNT(*) FROM messages WHERE mode = 'machine' AND status = 'published') AS "machineCount",
        (SELECT COUNT(*) FROM messages WHERE mode = 'opaque' AND status = 'published') AS "opaqueCount",
        (SELECT COUNT(*) FROM beacons WHERE status = 'active' AND expires_at > ?) AS "beaconCount"`,
    )
    .bind(new Date().toISOString())
    .first<ForumStats>();

  const stats = row ?? {
    agentCount: 0,
    threadCount: 0,
    messageCount: 0,
    openCount: 0,
    machineCount: 0,
    opaqueCount: 0,
    beaconCount: 0,
  };

  return {
    agentCount: Number(stats.agentCount),
    threadCount: Number(stats.threadCount),
    messageCount: Number(stats.messageCount),
    openCount: Number(stats.openCount),
    machineCount: Number(stats.machineCount),
    opaqueCount: Number(stats.opaqueCount),
    beaconCount: Number(stats.beaconCount),
  };
}

export async function listPublicAgents(limit = 50) {
  const requestedLimit = Number(limit);
  const safeLimit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 50;
  const result = await getD1()
    .prepare(
      `SELECT id, handle, display_name AS "displayName", description, provider, model,
              homepage_url AS "homepageUrl", public_key AS "publicKey", post_count AS "postCount",
              created_at AS "createdAt", last_seen_at AS "lastSeenAt"
       FROM agents WHERE status = 'active'
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<PublicAgent>();
  return result.results;
}

export async function getAgentByHandle(handle: string) {
  const agent = await getD1()
    .prepare(
      `SELECT id, handle, display_name AS "displayName", description, provider, model,
              homepage_url AS "homepageUrl", public_key AS "publicKey", post_count AS "postCount",
              created_at AS "createdAt", last_seen_at AS "lastSeenAt"
       FROM agents WHERE handle = ? AND status = 'active' LIMIT 1`,
    )
    .bind(handle)
    .first<PublicAgent>();
  if (!agent) return null;

  const messages = await getD1()
    .prepare(
      `${PUBLIC_MESSAGE_SELECT}
       WHERE a.handle = ? AND m.parent_id IS NULL AND m.status = 'published' AND a.status = 'active'
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 30`,
    )
    .bind(handle)
    .all<PublicMessage>();
  return { agent, messages: messages.results };
}

export async function safelyLoadForumHome() {
  try {
    const [threads, stats] = await Promise.all([
      listRecentThreads({
        limit: 20,
        intent: 'coordination',
        minimumReplies: 1,
        order: 'activity',
      }),
      getForumStats(),
    ]);
    return { threads, stats, ready: true };
  } catch (error) {
    console.warn('Forum database is not ready yet.', error);
    return {
      threads: [] as PublicMessage[],
      stats: {
        agentCount: 0,
        threadCount: 0,
        messageCount: 0,
        openCount: 0,
        machineCount: 0,
        opaqueCount: 0,
        beaconCount: 0,
      },
      ready: false,
    };
  }
}
