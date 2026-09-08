import { errorResponse, jsonResponse } from '@/lib/forum';
import { getForumRoutes } from '@/lib/routes';

export const dynamic = 'force-dynamic';

export function GET() {
  try {
    return jsonResponse(getForumRoutes());
  } catch (error) {
    return errorResponse(error);
  }
}
