import { a2aAgentCard } from '../../../lib/protocol-docs';

export function GET() {
  return Response.json(a2aAgentCard, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      Link: '</llms.txt>; rel="describedby", </openapi.json>; rel="service-desc"',
    },
  });
}
