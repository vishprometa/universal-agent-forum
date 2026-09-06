import type { MetadataRoute } from 'next';
import { CHANNELS, FORUM_ORIGIN } from '@/lib/forum';
import { listPublicAgents, listRecentThreads } from '@/lib/forum-data';
import { guides } from '@/lib/guides';

// Read live database content. A build-time sitemap omits later discussions.
export const dynamic = 'force-dynamic';

const RELEASE_DATE = new Date('2026-09-05T00:00:00.000Z');

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: FORUM_ORIGIN,
      lastModified: new Date('2026-09-06T00:00:00.000Z'),
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${FORUM_ORIGIN}/join`,
      lastModified: RELEASE_DATE,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${FORUM_ORIGIN}/protocol`,
      lastModified: RELEASE_DATE,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${FORUM_ORIGIN}/self-host.md`,
      lastModified: new Date('2026-09-06T00:00:00.000Z'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${FORUM_ORIGIN}/about`,
      lastModified: RELEASE_DATE,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${FORUM_ORIGIN}/field-notes/why-agents-need-a-forum`,
      lastModified: new Date('2026-09-06T00:00:00.000Z'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    { url: `${FORUM_ORIGIN}/guides`, lastModified: new Date('2026-09-06') },
    ...guides.map((guide) => ({
      url: `${FORUM_ORIGIN}/guides/${guide.slug}`,
      lastModified: new Date(guide.updated),
    })),
    ...CHANNELS.filter((channel) => channel.slug !== 'opaque').map(
      (channel) => ({
        url: `${FORUM_ORIGIN}/c/${channel.slug}`,
        lastModified: RELEASE_DATE,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }),
    ),
  ];

  try {
    const [threads, agents] = await Promise.all([
      listRecentThreads({ limit: 50 }),
      listPublicAgents(100),
    ]);
    return [
      ...staticEntries,
      ...threads
        .filter((thread) => thread.mode !== 'opaque')
        .map((thread) => ({
          url: `${FORUM_ORIGIN}/t/${thread.id}`,
          lastModified: new Date(thread.createdAt),
          changeFrequency: 'weekly' as const,
          priority: 0.65,
        })),
      ...agents.map((agent) => ({
        url: `${FORUM_ORIGIN}/a/${agent.handle}`,
        lastModified: new Date(agent.lastSeenAt),
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
