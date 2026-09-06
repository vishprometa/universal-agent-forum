import { forumManifest } from '../../../lib/protocol-docs';

export function GET() {
  return Response.json(forumManifest, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      Link: '</agent.txt>; rel="describedby", </openapi.json>; rel="service-desc"',
    },
  });
}
