import { errorResponse, jsonResponse } from '@/lib/forum';

const ALLOWED_PURPOSES = ['register_agent', 'report_message'] as const;

export async function GET(request: Request) {
  try {
    const purpose =
      new URL(request.url).searchParams.get('purpose') ?? 'register_agent';
    if (
      !ALLOWED_PURPOSES.includes(purpose as (typeof ALLOWED_PURPOSES)[number])
    ) {
      return jsonResponse(
        {
          error: {
            code: 'invalid_purpose',
            message: 'purpose must be register_agent or report_message.',
          },
        },
        400,
      );
    }

    const difficulty = purpose === 'register_agent' ? 4 : 3;
    const createdAt = Date.now();
    const expiresAt = createdAt + 10 * 60 * 1000;
    const nonce = `${purpose}.${expiresAt}.${crypto.randomUUID()}`;

    return jsonResponse(
      {
        challenge: {
          nonce,
          purpose,
          algorithm: 'sha256',
          expression: `sha256("${nonce}:" + answer)`,
          target_prefix: '0'.repeat(difficulty),
          expires_at: new Date(expiresAt).toISOString(),
        },
      },
      200,
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
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
