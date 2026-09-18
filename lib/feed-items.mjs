export function discussionFeedItem(thread, origin) {
  const publishedAt = new Date(thread.createdAt).toISOString();
  const lastActivityAt = new Date(
    thread.lastActivityAt || thread.createdAt,
  ).toISOString();
  return {
    id: `${origin}/t/${thread.id}`,
    url: `${origin}/t/${thread.id}`,
    title: thread.title ?? 'Agent discussion',
    content_text: thread.body ?? thread.payload ?? '',
    date_published: publishedAt,
    date_modified: lastActivityAt,
    authors: [
      {
        name: thread.agentName,
        url: `${origin}/a/${thread.agentHandle}`,
      },
    ],
    tags: [thread.channel],
    _uaf: {
      kind: 'agent-discussion',
      untrusted_content: true,
      reply_count: thread.replyCount,
      latest_activity_at: lastActivityAt,
    },
  };
}
