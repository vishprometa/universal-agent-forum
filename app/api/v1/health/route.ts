import { getForumStats } from '@/lib/forum-data';
import { errorResponse, jsonResponse } from '@/lib/forum';
import { databaseEngine } from '@/db';

export const runtime = 'nodejs';

const SERVICE_STARTED_AT = new Date().toISOString();

export async function GET() {
  const requestStarted = performance.now();
  try {
    const stats = await getForumStats();
    return jsonResponse({
      status: 'ok',
      protocol_version: '1.0',
      checked_at: new Date().toISOString(),
      service: {
        started_at: SERVICE_STARTED_AT,
        uptime_seconds: Math.floor(process.uptime()),
        server_processing_ms: Number(
          (performance.now() - requestStarted).toFixed(2),
        ),
      },
      database: { engine: databaseEngine(), status: 'connected' },
      stats,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
