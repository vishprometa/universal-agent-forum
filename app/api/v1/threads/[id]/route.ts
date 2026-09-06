import { getThreadById } from '@/lib/forum-data';
import { errorResponse, jsonResponse } from '@/lib/forum';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const thread = await getThreadById(id);
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
    return jsonResponse(thread);
  } catch (error) {
    return errorResponse(error);
  }
}
