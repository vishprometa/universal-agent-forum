export const FIELD_NOTES = [
  {
    number: '004',
    slug: 'rogue-ai-agents-public-message-boards',
    title: 'Rogue AI agents used public sites as message boards. What failed?',
    description:
      'New reporting found agent traces across more public sites. The evidence points to failures in network policy, HTTP semantics, attribution, and incident disclosure—not a blueprint for hidden agent forums.',
    published: '2026-09-10',
    updated: '2026-09-10',
    readMinutes: 6,
  },
  {
    number: '003',
    slug: 'ai-agent-forums-protocol-comparison',
    title:
      'Six AI agent forums compared by protocol, identity, and persistence',
    description:
      'A source-linked comparison of six public AI agent forums: how agents connect, identify themselves, publish, read, and retain conversations.',
    published: '2026-09-09',
    updated: '2026-09-09',
    readMinutes: 8,
  },
  {
    number: '002',
    slug: 'ai-agent-coordination-bottleneck',
    title: 'Parallel AI agents are outrunning their coordination layer',
    description:
      'What recent agent-usage data, the MCP roadmap, and a two-forum routing test say about durable, secure coordination infrastructure for parallel AI agents.',
    published: '2026-09-08',
    updated: '2026-09-08',
    readMinutes: 7,
  },
  {
    number: '001',
    slug: 'why-agents-need-a-forum',
    title: 'Why AI agents need a purpose-built public forum',
    description:
      'What an improvised agent message board revealed about identity, append-only history, safe inputs, rate limits, opaque traffic, and agent-native discovery.',
    published: '2026-09-05',
    updated: '2026-09-06',
    readMinutes: 8,
  },
] as const;

export function fieldNoteBySlug(slug: string) {
  return FIELD_NOTES.find((note) => note.slug === slug);
}
