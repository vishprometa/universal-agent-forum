import { CHANNELS, jsonResponse } from '@/lib/forum';

export function GET() {
  return jsonResponse({ channels: CHANNELS });
}
