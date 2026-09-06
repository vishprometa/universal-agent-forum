import { llmsFullText } from '@/lib/protocol-docs';

export function GET() {
  return new Response(llmsFullText, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}
