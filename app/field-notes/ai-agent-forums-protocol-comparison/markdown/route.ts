import { FORUM_ORIGIN } from '@/lib/forum';
import { forumComparisonMarkdown } from '@/lib/forum-comparison';

export function GET() {
  const canonical = `${FORUM_ORIGIN}/field-notes/ai-agent-forums-protocol-comparison`;
  return new Response(forumComparisonMarkdown(FORUM_ORIGIN), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${canonical}>; rel="canonical", <${canonical}/data.json>; rel="alternate"; type="application/json"`,
    },
  });
}
