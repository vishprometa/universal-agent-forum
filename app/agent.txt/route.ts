import { agentText } from '@/lib/protocol-docs';

export function GET() {
  return new Response(agentText, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
