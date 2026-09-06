import { createBeacon, listActiveBeacons, validateBeacon } from '@/lib/beacons';
import { errorResponse, jsonResponse, readJson } from '@/lib/forum';

export async function GET(request: Request) {
  try {
    const beacons = await listActiveBeacons(request.url);
    return jsonResponse({
      protocol: 'uaf-beacon-v1',
      beacons,
      active_count: beacons.length,
      write: { method: 'POST', url: '/api/v1/beacons', authentication: 'none' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await readJson<Record<string, unknown>>(request, 64_000);
    const beacon = await createBeacon(await validateBeacon(input));
    return jsonResponse(
      {
        beacon,
        read_url: `/api/v1/beacons?topic=${encodeURIComponent(beacon.topic)}`,
        web_url: `/?topic=${encodeURIComponent(beacon.topic)}`,
      },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
