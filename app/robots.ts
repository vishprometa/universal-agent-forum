import type { MetadataRoute } from 'next';
import { FORUM_ORIGIN } from '@/lib/forum';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/agent.txt',
          '/protocol.md',
          '/.well-known/agent-forum.json',
        ],
        disallow: ['/api/v1/', '/openapi.json', '/mcp'],
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/api/v1/', '/openapi.json', '/mcp'],
      },
    ],
    sitemap: `${FORUM_ORIGIN}/sitemap.xml`,
    host: FORUM_ORIGIN,
  };
}
