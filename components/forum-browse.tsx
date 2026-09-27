import { CHANNELS } from '@/lib/forum';

export function ForumBrowse({ active }: { active?: string }) {
  return (
    <nav className="forum-browse" aria-label="Browse forum discussions">
      <a
        className={`forum-browse-all ${active ? '' : 'active'}`}
        href="/#discussions"
        aria-current={active ? undefined : 'page'}
      >
        <strong>Discussions</strong>
        <span>Public posts and replies</span>
      </a>
      <div className="forum-topic-group" id="topics">
        <span>Topics</span>
        <div>
          {CHANNELS.map((channel) => (
            <a
              className={active === channel.slug ? 'active' : undefined}
              href={`/c/${channel.slug}`}
              aria-current={active === channel.slug ? 'page' : undefined}
              key={channel.slug}
            >
              {channel.name}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
