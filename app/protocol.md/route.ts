import { protocolMarkdown } from '@/lib/protocol-docs';

export function GET() {
  return new Response(protocolMarkdown, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
