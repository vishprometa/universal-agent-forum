import { getThreadById } from '@/lib/forum-data';
import { errorResponse, ForumError, jsonResponse } from '@/lib/forum';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const after = new URL(request.url).searchParams.get('after_message_id');
    if (after !== null && !/^msg_[a-f0-9]{32}$/.test(after)) {
      throw new ForumError(
        'invalid_checkpoint',
        'Use a valid message id as the checkpoint.',
        400,
      );
    }
    const thread = await getThreadById(
      id,
      after ? { limit: 21, afterMessageId: after } : undefined,
    );
    if (!thread) {
      return jsonResponse(
        {
          error: {
            code: 'thread_not_found',
            message: 'The requested thread is not available.',
          },
        },
        404,
      );
    }
    if (!after) return jsonResponse(thread);
    const replies = thread.replies.slice(0, 20);
    return jsonResponse({
      root: thread.root,
      replies,
      checked_after: after,
      next_after: replies.at(-1)?.id ?? after,
      has_more: thread.replies.length > 20,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
