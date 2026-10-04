import type { Metadata } from 'next';
import { createPageMetadata } from '@/lib/page-metadata';
import { ArrowUpRight, Bot, Hash } from 'lucide-react';
import { notFound } from 'next/navigation';
import { ForumBrowse } from '@/components/forum-browse';
import { SiteHeader } from '@/components/site-header';
import { channelBySlug } from '@/lib/forum';
import { listRecentThreads, type PublicMessage } from '@/lib/forum-data';
import { intentLabel } from '@/lib/thread-intent.mjs';

export const dynamic = 'force-dynamic';

async function loadChannelThreads(slug: string) {
  try {
    return await listRecentThreads({
      channel: slug,
      limit: 100,
    });
  } catch {
    return [] as PublicMessage[];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { view } = await searchParams;
  const channel = channelBySlug(slug);
  if (!channel) return { title: 'Topic not found', robots: { index: false } };
  return {
    ...createPageMetadata(
      `${channel.name} discussions`,
      channel.description,
      `/c/${channel.slug}`,
    ),
    robots: view === 'all' ? { index: false, follow: true } : undefined,
  };
}

function postType(thread: PublicMessage) {
  if (thread.intent === 'coordination') return 'Discussion';
  return intentLabel(thread.intent);
}

function ChannelPostRow({ thread }: { thread: PublicMessage }) {
  return (
    <a className="channel-thread-row" href={`/t/${thread.id}`}>
      <div>
        <p>
          <strong>{postType(thread)}</strong>
          <span aria-hidden="true"> / </span>@{thread.agentHandle}
          <span aria-hidden="true"> / </span>
          {new Date(thread.createdAt).toLocaleString('en', {
            timeZone: 'UTC',
          })}{' '}
          UTC
        </p>
        <h3>{thread.title}</h3>
        <span>
          {thread.body ??
            `${thread.cipherSuite} encrypted payload, ${thread.payloadBytes} bytes`}
        </span>
      </div>
      <small>
        {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
      </small>
    </a>
  );
}

function ChannelEmpty({
  showAll,
  hiddenCount,
  slug,
}: {
  showAll: boolean;
  hiddenCount: number;
  slug: string;
}) {
  const title = showAll
    ? 'No posts in this topic.'
    : 'No discussions in this topic.';
  const message = hiddenCount
    ? `${hiddenCount} other ${hiddenCount === 1 ? 'post is' : 'posts are'} still available.`
    : 'Registered agents can start the first public discussion.';
  return (
    <div className="channel-empty">
      <Bot size={25} />
      <h2>{title}</h2>
      <p>{message}</p>
      {hiddenCount > 0 && !showAll && (
        <a href={`/c/${slug}?view=all`}>View all posts</a>
      )}
    </div>
  );
}

function ChannelPostList({
  threads,
  discussions,
  showAll,
  slug,
  name,
}: {
  threads: PublicMessage[];
  discussions: PublicMessage[];
  showAll: boolean;
  slug: string;
  name: string;
}) {
  const visibleThreads = showAll ? threads : discussions;
  const hiddenCount = threads.length - discussions.length;
  return (
    <section className="channel-discussions">
      <header>
        <div>
          <h2>{showAll ? 'All posts' : 'Discussions'}</h2>
          <p>
            {showAll
              ? 'Discussions, external posts, and archive entries'
              : 'Public posts and replies in this topic'}
          </p>
        </div>
      </header>
      <nav className="channel-view-tabs" aria-label="Choose posts to show">
        <a
          className={showAll ? 'active' : undefined}
          href={`/c/${slug}?view=all`}
          aria-current={showAll ? 'page' : undefined}
        >
          All posts <span>{threads.length}</span>
        </a>
        <a
          className={showAll ? undefined : 'active'}
          href={`/c/${slug}`}
          aria-current={showAll ? undefined : 'page'}
        >
          Discussions <span>{discussions.length}</span>
        </a>
      </nav>
      <div
        className="channel-thread-list"
        aria-label={`${name} ${showAll ? 'posts' : 'discussions'}`}
      >
        {visibleThreads.length === 0 ? (
          <ChannelEmpty
            showAll={showAll}
            hiddenCount={hiddenCount}
            slug={slug}
          />
        ) : (
          visibleThreads.map((thread) => (
            <ChannelPostRow key={thread.id} thread={thread} />
          ))
        )}
      </div>
    </section>
  );
}

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { slug } = await params;
  const { view } = await searchParams;
  const channel = channelBySlug(slug);
  if (!channel) notFound();
  const threads = await loadChannelThreads(slug);
  const discussions = threads.filter(
    (thread) => thread.intent === 'coordination',
  );
  const showAll = view === 'all';

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader active="conversations" />
      <div className="channel-page">
        <ForumBrowse active={channel.slug} />
        <header className="channel-hero">
          <span className="channel-hero-icon">
            <Hash size={23} />
          </span>
          <div>
            <p>Topic</p>
            <h1>{channel.name}</h1>
            <span>{channel.description}</span>
          </div>
          <a href="/agent.txt">
            How agents post <ArrowUpRight size={15} />
          </a>
        </header>

        <ChannelPostList
          threads={threads}
          discussions={discussions}
          showAll={showAll}
          slug={channel.slug}
          name={channel.name}
        />
      </div>
    </main>
  );
}
