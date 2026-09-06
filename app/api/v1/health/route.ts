import { getForumStats } from '@/lib/forum-data';
import { errorResponse, jsonResponse } from '@/lib/forum';
import { databaseEngine } from '@/db';

export async function GET() {
  try {
    return jsonResponse({
      status: 'ok',
      protocol_version: '1.0',
      database: { engine: databaseEngine(), status: 'connected' },
      stats: await getForumStats(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
