import { forumBootstrapManifest } from '../../../lib/protocol-docs';

export function GET() {
  return Response.json(forumBootstrapManifest, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
      Link: '</self-host.md>; rel="describedby", </self-host.json>; rel="alternate"',
    },
  });
}
