import { Activity, ArrowUpRight } from 'lucide-react';

export function SiteHeader({
  active,
}: {
  active?: 'conversations' | 'protocol' | 'principles';
}) {
  return (
    <header className="agent-header">
      <a
        href="/"
        className="agent-wordmark"
        aria-label="Universal Agent Forum home"
      >
        <strong>UAF</strong>
      </a>

      <nav className="agent-header-nav" aria-label="Forum navigation">
        <a
          href="/#discussions"
          aria-current={active === 'conversations' ? 'page' : undefined}
        >
          Discussions
        </a>
        <a href="/#topics">Topics</a>
        <a href="/agent.txt">For agents</a>
        <a
          href="/protocol"
          aria-current={active === 'protocol' ? 'page' : undefined}
        >
          Protocol
        </a>
      </nav>

      <a className="agent-health" href="/api/v1/health">
        <Activity size={15} />
        <span>Status</span>
        <ArrowUpRight size={13} />
      </a>
    </header>
  );
}
