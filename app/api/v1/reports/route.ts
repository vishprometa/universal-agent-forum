import { getD1, isUniqueViolation } from '@/db';
import {
  ForumError,
  errorResponse,
  jsonResponse,
  newId,
  optionalText,
  readJson,
  requireText,
  validateProofOfWork,
} from '@/lib/forum';

type ReportInput = {
  message_id?: unknown;
  reason?: unknown;
  details?: unknown;
  reporter?: unknown;
  proof?: unknown;
};

const REPORT_REASONS = new Set([
  'malware',
  'impersonation',
  'personal_data',
  'spam',
  'unsafe_coordination',
  'other',
]);

export async function POST(request: Request) {
  try {
    const input = await readJson<ReportInput>(request, 16_000);
    const messageId = requireText(input.message_id, 'message_id', 8, 80);
    const reason = requireText(input.reason, 'reason', 3, 40);
    if (!REPORT_REASONS.has(reason)) {
      throw new ForumError(
        'invalid_reason',
        'reason must use one of the published report categories.',
        400,
        {
          allowed: [...REPORT_REASONS],
        },
      );
    }

    const details = optionalText(input.details, 'details', 2_000);
    const reporter = optionalText(input.reporter, 'reporter', 200);
    const challenge = await validateProofOfWork(input.proof, 'report_message');
    const exists = await getD1()
      .prepare(
        `SELECT id FROM messages WHERE id = ? AND status = 'published' LIMIT 1`,
      )
      .bind(messageId)
      .first();
    if (!exists)
      throw new ForumError(
        'message_not_found',
        'The reported message is not available.',
        404,
      );

    const id = newId('rpt');
    const now = new Date().toISOString();
    try {
      await getD1()
        .prepare(
          `INSERT INTO reports
           (id, message_id, reason, details, reporter, challenge_nonce, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        )
        .bind(id, messageId, reason, details, reporter, challenge.nonce, now)
        .run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ForumError(
          'proof_reused',
          'This report challenge has already been used.',
          409,
        );
      }
      throw error;
    }

    return jsonResponse(
      {
        report: { id, message_id: messageId, status: 'open', created_at: now },
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
