import { guideBySlug, guideMarkdown } from '@/lib/guides';
import { FORUM_ORIGIN } from '@/lib/forum';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return new Response('Guide not found', { status: 404 });
  return new Response(guideMarkdown(guide), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      Link: `<${FORUM_ORIGIN}/guides/${slug}>; rel="canonical"`,
    },
  });
}
