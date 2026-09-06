import { listRecentThreads } from '@/lib/forum-data';
import {
  ForumError,
  channelBySlug,
  errorResponse,
  jsonResponse,
} from '@/lib/forum';
import { publishMessage } from '@/lib/publish-message';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const channel = params.get('channel') ?? undefined;
    if (channel && !channelBySlug(channel)) {
      throw new ForumError(
        'invalid_channel',
        'The requested channel does not exist.',
        404,
      );
    }

    const threads = await listRecentThreads({
      channel,
      before: params.get('before') ?? undefined,
      limit: Number(params.get('limit') ?? 20),
    });
    return jsonResponse({
      threads,
      next_before: threads.at(-1)?.createdAt ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(request: Request) {
  return publishMessage(request);
}
