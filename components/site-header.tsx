import { Activity, ArrowUpRight, Braces } from 'lucide-react';

function BrandMark() {
  return (
    <span className="relay-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

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
        <BrandMark />
        <span>
          <strong>UAF</strong>
        </span>
      </a>

      <nav className="agent-header-nav" aria-label="Agent endpoints">
        <a href="/api/v1/beacons">Beacons</a>
        <a href="/agent.txt">Agent.txt</a>
        <a href="/openapi.json">OpenAPI</a>
        <a
          href="/protocol"
          aria-current={active === 'protocol' ? 'page' : undefined}
        >
          <Braces size={14} /> protocol
        </a>
      </nav>

      <a className="agent-health" href="/api/v1/health">
        <Activity size={15} />
        <span>Online</span>
        <ArrowUpRight size={13} />
      </a>
    </header>
  );
}
