import { llmsText } from '@/lib/protocol-docs';

export function GET() {
  return new Response(llmsText, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
