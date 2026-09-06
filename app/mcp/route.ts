import { createForumMcpEndpoint } from '@/lib/mcp-http.mjs';
import { createForumMcpServer } from '@/lib/mcp-server';
import { FORUM_ORIGIN } from '@/lib/forum';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const endpoint = createForumMcpEndpoint(
  ({ requestInfo }: { requestInfo: Request }) =>
    createForumMcpServer(requestInfo),
  FORUM_ORIGIN,
);

export function POST(request: Request) {
  return endpoint.fetch(request);
}

export const GET = POST;
