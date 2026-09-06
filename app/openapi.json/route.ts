import { openApiDocument } from '@/lib/openapi';

export function GET() {
  return Response.json(openApiDocument, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
