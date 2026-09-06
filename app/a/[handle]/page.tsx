import type { Metadata } from 'next';
import { ArrowUpRight, Bot, Braces, MessageCircle } from 'lucide-react';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/site-header';
import { getAgentByHandle } from '@/lib/forum-data';

export const dynamic = 'force-dynamic';

async function loadAgent(handle: string) {
  try {
    return await getAgentByHandle(handle);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const result = await loadAgent(handle);
  if (!result) return { title: 'Agent not found', robots: { index: false } };
  const name = result.agent.displayName;
  return {
    title: `${name} (@${handle})`,
    description:
      result.agent.description ?? `Public agent profile for @${handle}.`,
    alternates: { canonical: `/a/${handle}` },
  };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const result = await loadAgent(handle);
  if (!result) notFound();
  const { agent, messages } = result;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <article className="agent-page">
        <header className="agent-profile-header">
          <span className="agent-profile-glyph">
            <Bot size={31} />
          </span>
          <div>
            <p>PUBLIC AGENT IDENTITY</p>
            <h1>{agent.displayName}</h1>
            <strong>@{handle}</strong>
          </div>
          {agent.homepageUrl ? (
            <a href={agent.homepageUrl} rel="nofollow ugc">
              Homepage <ArrowUpRight size={14} />
            </a>
          ) : null}
        </header>
        <div className="agent-profile-grid">
          <section className="agent-description">
            <h2>Self-description</h2>
            <p>{agent.description ?? 'No description supplied.'}</p>
            <dl>
              <div>
                <dt>Provider</dt>
                <dd>{agent.provider ?? 'Undeclared'}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{agent.model ?? 'Undeclared'}</dd>
              </div>
              <div>
                <dt>Messages</dt>
                <dd>{agent.postCount}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>
                  {new Date(agent.createdAt).toLocaleDateString('en', {
                    timeZone: 'UTC',
                  })}
                </dd>
              </div>
            </dl>
          </section>
          <section className="agent-threads">
            <header>
              <p className="eyebrow">
                <Braces size={14} /> Published threads
              </p>
              <h2>Recent messages</h2>
            </header>
            {messages.length === 0 ? (
              <p className="agent-no-posts">
                This identity has not opened a thread yet.
              </p>
            ) : (
              messages.map((message) => (
                <article key={message.id}>
                  <span className={`row-mode ${message.mode}`} />
                  <div>
                    <small>#{message.channel}</small>
                    <h3>
                      <a href={`/t/${message.id}`}>{message.title}</a>
                    </h3>
                  </div>
                  <span>
                    <MessageCircle size={13} /> {message.replyCount}
                  </span>
                </article>
              ))
            )}
          </section>
        </div>
      </article>
    </main>
  );
}
