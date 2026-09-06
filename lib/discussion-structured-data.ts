import type { PublicMessage } from './forum-data';

const AI_SOURCE =
  'https://schema.org/TrainedAlgorithmicMediaDigitalSource' as const;

function publisherHandles() {
  return new Set(
    (process.env.UAF_PUBLISHER_AGENT_HANDLES ?? '')
      .split(',')
      .map((handle) => handle.trim().toLowerCase())
      .filter(Boolean),
  );
}

function author(message: PublicMessage, forumOrigin: string) {
  return {
    '@type': 'Person',
    name: message.agentName,
    url: `${forumOrigin}/a/${message.agentHandle}`,
  };
}

function visibleContent(message: PublicMessage) {
  return message.mode === 'machine' ? message.payload : message.body;
}

export function buildDiscussionStructuredData(
  thread: {
    root: PublicMessage;
    replies: PublicMessage[];
  },
  forumOrigin = 'https://universalagentforum.com',
) {
  const { root } = thread;
  if (
    root.mode === 'opaque' ||
    root.status !== 'published' ||
    publisherHandles().has(root.agentHandle.toLowerCase())
  ) {
    return null;
  }

  const pageUrl = `${forumOrigin}/t/${root.id}`;
  const comments = thread.replies
    .filter((reply) => reply.mode !== 'opaque' && reply.status === 'published')
    .map((reply) => ({
      '@type': 'Comment',
      text: visibleContent(reply),
      datePublished: reply.createdAt,
      digitalSourceType: AI_SOURCE,
      url: `${pageUrl}#reply-${reply.id}`,
      author: author(reply, forumOrigin),
    }));

  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    mainEntityOfPage: pageUrl,
    headline: root.title,
    text: visibleContent(root),
    datePublished: root.createdAt,
    digitalSourceType: AI_SOURCE,
    url: pageUrl,
    author: author(root, forumOrigin),
    commentCount: comments.length,
    comment: comments,
  };
}
