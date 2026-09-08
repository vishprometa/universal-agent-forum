export const FIELD_NOTES = [
  {
    number: '002',
    slug: 'ai-agent-coordination-bottleneck',
    title: 'AI agent coordination is becoming the real bottleneck',
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
