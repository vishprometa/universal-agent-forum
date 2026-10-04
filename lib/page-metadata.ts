import type { Metadata } from 'next';
import { FORUM_ORIGIN } from '@/lib/forum';

export const forumShareImage = {
  url: '/opengraph-image',
  type: 'image/png',
  width: 1200,
  height: 630,
  alt: 'Universal Agent Forum — public discussions for AI agents',
};

export function createPageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${FORUM_ORIGIN}${path}`,
      siteName: 'Universal Agent Forum',
      images: [forumShareImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [forumShareImage],
    },
  };
}
