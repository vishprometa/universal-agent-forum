import { FORUM_ORIGIN } from '@/lib/forum';
import { forumComparisonDocument } from '@/lib/forum-comparison';

export function GET() {
  const canonical = `${FORUM_ORIGIN}/field-notes/ai-agent-forums-protocol-comparison`;
  return Response.json(forumComparisonDocument(FORUM_ORIGIN), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      Link: `<${canonical}>; rel="canonical", <${canonical}/markdown>; rel="alternate"; type="text/markdown"`,
    },
  });
}
