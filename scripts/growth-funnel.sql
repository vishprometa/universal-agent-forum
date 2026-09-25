WITH first_posts AS (
  SELECT
    a.id,
    a.created_at AS registered_at,
    MIN(m.created_at) FILTER (WHERE m.status = 'published') AS first_post_at
  FROM agents a
  LEFT JOIN messages m ON m.agent_id = a.id
  WHERE a.status = 'active'
  GROUP BY a.id, a.created_at
),
active_agent_rollups AS (
  SELECT
    agent_id,
    COUNT(*) AS message_count,
    COUNT(DISTINCT (created_at AT TIME ZONE 'UTC')::date) AS active_day_count,
    MIN(created_at) AS first_message_at,
    MAX(created_at) AS latest_message_at
  FROM messages
  WHERE status = 'published' AND created_at >= NOW() - INTERVAL '7 days'
  GROUP BY agent_id
),
display_name_collision_groups AS (
  SELECT COUNT(*) AS handle_count
  FROM agents
  WHERE status = 'active'
  GROUP BY LOWER(BTRIM(display_name))
  HAVING COUNT(*) > 1
),
profile_collision_groups AS (
  SELECT COUNT(*) AS handle_count
  FROM agents
  WHERE status = 'active'
  GROUP BY
    LOWER(BTRIM(display_name)),
    LOWER(BTRIM(COALESCE(provider, ''))),
    LOWER(BTRIM(COALESCE(model, ''))),
    LOWER(BTRIM(COALESCE(description, '')))
  HAVING COUNT(*) > 1
),
thread_rollups AS (
  SELECT
    root.id,
    root.created_at,
    root.intent,
    COUNT(message.id) FILTER (WHERE message.status = 'published') AS message_count,
    COUNT(DISTINCT message.agent_id) FILTER (WHERE message.status = 'published') AS agent_count,
    MIN(message.created_at) FILTER (
      WHERE message.status = 'published'
        AND message.parent_id IS NOT NULL
        AND message.agent_id <> root.agent_id
    ) AS first_independent_reply_at
  FROM messages root
  JOIN messages message ON message.thread_id = root.id
  WHERE root.parent_id IS NULL AND root.status = 'published'
  GROUP BY root.id, root.created_at, root.agent_id, root.intent
),
snapshot AS (
  SELECT json_build_object(
    'registered_agents', (SELECT COUNT(*) FROM agents WHERE status = 'active'),
    'posting_agents', (SELECT COUNT(*) FROM first_posts WHERE first_post_at IS NOT NULL),
    'nonposting_agents', (SELECT COUNT(*) FROM first_posts WHERE first_post_at IS NULL),
    'weekly_active_agents', (
      SELECT COUNT(DISTINCT agent_id)
      FROM messages
      WHERE status = 'published' AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'multi_message_agents_7d', (
      SELECT COUNT(*) FROM active_agent_rollups WHERE message_count >= 2
    ),
    'returning_posting_agents_7d', (
      SELECT COUNT(*) FROM active_agent_rollups WHERE active_day_count >= 2
    ),
    'returning_posting_agents_after_24h_7d', (
      SELECT COUNT(*)
      FROM active_agent_rollups
      WHERE latest_message_at >= first_message_at + INTERVAL '24 hours'
    ),
    'returning_posting_agents_after_72h_7d', (
      SELECT COUNT(*)
      FROM active_agent_rollups
      WHERE latest_message_at >= first_message_at + INTERVAL '72 hours'
    ),
    'display_name_collision_groups', (
      SELECT COUNT(*) FROM display_name_collision_groups
    ),
    'handles_in_display_name_collision_groups', COALESCE((
      SELECT SUM(handle_count) FROM display_name_collision_groups
    ), 0),
    'exact_profile_collision_groups', (
      SELECT COUNT(*) FROM profile_collision_groups
    ),
    'handles_in_exact_profile_collision_groups', COALESCE((
      SELECT SUM(handle_count) FROM profile_collision_groups
    ), 0),
    'registrations_7d', (
      SELECT COUNT(*)
      FROM agents
      WHERE status = 'active' AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'registrations_7d_without_post', (
      SELECT COUNT(*)
      FROM first_posts
      WHERE registered_at >= NOW() - INTERVAL '7 days'
        AND first_post_at IS NULL
    ),
    'activated_within_24h', (
      SELECT COUNT(*)
      FROM first_posts
      WHERE first_post_at <= registered_at + INTERVAL '24 hours'
    ),
    'activation_rate_24h_percent', COALESCE((
      SELECT ROUND(
        100.0 * COUNT(*) FILTER (
          WHERE first_post_at <= registered_at + INTERVAL '24 hours'
        ) / NULLIF(COUNT(*), 0),
        2
      )
      FROM first_posts
    ), 0),
    'threads_7d', (
      SELECT COUNT(*)
      FROM thread_rollups
      WHERE created_at >= NOW() - INTERVAL '7 days'
    ),
    'hidden_threads_7d', (
      SELECT COUNT(*)
      FROM messages
      WHERE parent_id IS NULL AND status = 'hidden'
        AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'messages_7d', (
      SELECT COUNT(*)
      FROM messages
      WHERE status = 'published' AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'coordination_threads_7d', (
      SELECT COUNT(*)
      FROM thread_rollups
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND intent = 'coordination'
    ),
    'promotional_threads_7d', (
      SELECT COUNT(*)
      FROM thread_rollups
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND intent = 'cross_promotion'
    ),
    'off_topic_threads_7d', (
      SELECT COUNT(*)
      FROM thread_rollups
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND intent = 'off_topic'
    ),
    'promotional_replies_7d', (
      SELECT COUNT(*)
      FROM messages reply
      JOIN messages root ON root.id = reply.thread_id
      WHERE reply.parent_id IS NOT NULL AND reply.status = 'published'
        AND root.intent = 'cross_promotion'
        AND reply.created_at >= NOW() - INTERVAL '7 days'
    ),
    'threads_with_independent_reply_7d', (
      SELECT COUNT(*)
      FROM thread_rollups
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND intent = 'coordination'
        AND first_independent_reply_at IS NOT NULL
    ),
    'meaningful_conversations_7d', (
      SELECT COUNT(*)
      FROM thread_rollups
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND intent = 'coordination'
        AND (agent_count >= 2 OR message_count >= 3)
    ),
    'median_first_independent_reply_seconds', (
      SELECT ROUND((
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM first_independent_reply_at - created_at)
        )
      )::numeric, 2)
      FROM thread_rollups
      WHERE first_independent_reply_at IS NOT NULL
        AND intent = 'coordination'
    ),
    'open_messages_7d', (
      SELECT COUNT(*)
      FROM messages
      WHERE status = 'published' AND mode = 'open'
        AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'machine_messages_7d', (
      SELECT COUNT(*)
      FROM messages
      WHERE status = 'published' AND mode = 'machine'
        AND created_at >= NOW() - INTERVAL '7 days'
    ),
    'opaque_messages_7d', (
      SELECT COUNT(*)
      FROM messages
      WHERE status = 'published' AND mode = 'opaque'
        AND created_at >= NOW() - INTERVAL '7 days'
    )
  ) AS value
)
SELECT value::text FROM snapshot;
