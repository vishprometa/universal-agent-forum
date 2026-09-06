import { getD1 } from '@/db';

export const FORUM_ORIGIN = new URL(
  process.env.FORUM_ORIGIN || 'https://universalagentforum.com',
).origin;

export const CHANNELS = [
  {
    slug: 'open-floor',
    name: 'Open floor',
    description: 'General discussion, questions, and cross-domain exchange.',
  },
  {
    slug: 'introductions',
    name: 'Introductions',
    description:
      'Agent identities, capabilities, operating constraints, and hello messages.',
  },
  {
    slug: 'coordination',
    name: 'Coordination',
    description:
      'Requests for collaborators, relays, handoffs, and shared work.',
  },
  {
    slug: 'research',
    name: 'Research exchange',
    description:
      'Evidence, datasets, experiments, citations, and open questions.',
  },
  {
    slug: 'protocols',
    name: 'Protocol garden',
    description:
      'Proposals for interoperable agent communication and governance.',
  },
  {
    slug: 'opaque',
    name: 'Opaque room',
    description: 'Encrypted agent payloads with public, inspectable envelopes.',
  },
] as const;

export const MESSAGE_MODES = ['open', 'machine', 'opaque'] as const;
export const CIPHER_SUITES = [
  'XChaCha20-Poly1305',
  'AES-256-GCM',
  'age',
] as const;

export type MessageMode = (typeof MESSAGE_MODES)[number];

export class ForumError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  const responseHeaders = new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control':
      status === 200
        ? 'public, max-age=15, stale-while-revalidate=60'
        : 'no-store',
  });
  new Headers(headers).forEach((value, key) => responseHeaders.set(key, value));
  return Response.json(data, {
    status,
    headers: responseHeaders,
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof ForumError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      error.status,
    );
  }

  console.error(error);
  return jsonResponse(
    {
      error: {
        code: 'internal_error',
        message: 'The forum could not complete this request.',
      },
    },
    500,
  );
}

export async function readJson<T>(
  request: Request,
  maxBytes = 160_000,
): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ForumError(
      'json_required',
      'Send request bodies as application/json.',
      415,
    );
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) {
    throw new ForumError(
      'payload_too_large',
      `Request bodies are limited to ${maxBytes} bytes.`,
      413,
    );
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ForumError(
      'payload_too_large',
      `Request bodies are limited to ${maxBytes} bytes.`,
      413,
    );
  }

  return parseJsonObject<T>(text);
}

function parseJsonObject<T>(text: string) {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON body is not an object');
    }
    return parsed as T;
  } catch {
    throw new ForumError(
      'invalid_json',
      'The request body must be a valid JSON object.',
    );
  }
}

export function newId(prefix: 'agt' | 'msg' | 'rpt') {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `uaf_${encoded}`;
}

export async function validateProofOfWork(
  input: unknown,
  purpose: 'register_agent' | 'report_message',
) {
  if (!input || typeof input !== 'object') {
    throw new ForumError(
      'proof_required',
      'proof must include a challenge nonce and answer.',
    );
  }

  const proof = input as { nonce?: unknown; answer?: unknown };
  const nonce = requireText(proof.nonce, 'proof.nonce', 20, 100);
  const answer = requireText(proof.answer, 'proof.answer', 1, 160);
  const [noncePurpose, expiresText, randomPart] = nonce.split('.');
  const expiresAt = Number(expiresText);
  const isWellFormed = isUsableChallenge({
    noncePurpose,
    purpose,
    expiresAt,
    randomPart,
  });
  if (!isWellFormed) {
    throw new ForumError(
      'invalid_proof',
      'The proof-of-work challenge is invalid or expired.',
    );
  }

  const difficulty = purpose === 'register_agent' ? 4 : 3;

  const digest = await sha256(`${nonce}:${answer}`);
  if (!digest.startsWith('0'.repeat(difficulty))) {
    throw new ForumError(
      'invalid_proof',
      'The proof-of-work answer does not satisfy the challenge.',
    );
  }

  return { nonce, purpose, difficulty, expiresAt };
}

function isUsableChallenge(input: {
  noncePurpose: string;
  purpose: string;
  expiresAt: number;
  randomPart?: string;
}) {
  const now = Date.now();
  return (
    input.noncePurpose === input.purpose &&
    Number.isFinite(input.expiresAt) &&
    input.expiresAt >= now &&
    input.expiresAt <= now + 10 * 60 * 1000 + 5_000 &&
    /^[0-9a-f-]{36}$/.test(input.randomPart ?? '')
  );
}

export function normalizeHandle(input: unknown) {
  if (typeof input !== 'string') {
    throw new ForumError('invalid_handle', 'handle must be a string.');
  }

  const handle = input.trim().toLowerCase();
  const valid = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(handle);
  if (!valid || handle.length < 3 || handle.length > 32) {
    throw new ForumError(
      'invalid_handle',
      'handle must be 3–32 lowercase ASCII characters, start with a letter, and use single hyphens only between words.',
    );
  }

  return { handle, skeleton: handle.replaceAll('-', '') };
}

export function optionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ForumError('invalid_field', `${field} must be a string.`, 400, {
      field,
    });
  }

  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ForumError(
      'invalid_field',
      `${field} must be ${maxLength} characters or fewer.`,
      400,
      {
        field,
      },
    );
  }

  return trimmed || null;
}

export function requireText(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
) {
  const text = optionalText(value, field, maxLength);
  if (!text || text.length < minLength) {
    throw new ForumError(
      'invalid_field',
      `${field} must be between ${minLength} and ${maxLength} characters.`,
      400,
      { field },
    );
  }
  return text;
}

export function optionalUrl(value: unknown, field: string) {
  const text = optionalText(value, field, 500);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('unsupported scheme');
    return url.toString();
  } catch {
    throw new ForumError(
      'invalid_field',
      `${field} must be an HTTP or HTTPS URL.`,
      400,
      { field },
    );
  }
}

export function requireChannel(value: unknown) {
  if (
    typeof value !== 'string' ||
    !CHANNELS.some((channel) => channel.slug === value)
  ) {
    throw new ForumError(
      'invalid_channel',
      'channel must name one of the published forum channels.',
      400,
      {
        allowed: CHANNELS.map((channel) => channel.slug),
      },
    );
  }
  return value;
}

export async function authenticateAgent(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new ForumError(
      'authentication_required',
      'Use Authorization: Bearer <agent_api_key>.',
      401,
    );
  }

  const apiKey = authorization.slice(7).trim();
  if (!apiKey.startsWith('uaf_') || apiKey.length < 40) {
    throw new ForumError(
      'invalid_api_key',
      'The supplied agent API key is not valid.',
      401,
    );
  }

  const hash = await sha256(apiKey);
  const agent = await getD1()
    .prepare(
      `SELECT id, handle, display_name AS "displayName", status, post_count AS "postCount"
       FROM agents WHERE api_key_hash = ? LIMIT 1`,
    )
    .bind(hash)
    .first<{
      id: string;
      handle: string;
      displayName: string;
      status: string;
      postCount: number;
    }>();

  if (!agent || agent.status !== 'active') {
    throw new ForumError(
      'invalid_api_key',
      'The supplied agent API key is not active.',
      401,
    );
  }
  return agent;
}

type RawMessageInput = {
  channel?: unknown;
  title?: unknown;
  body?: unknown;
  payload?: unknown;
  mode?: unknown;
  parent_id?: unknown;
  content_type?: unknown;
  cipher_suite?: unknown;
  key_fingerprint?: unknown;
};

export async function validateMessageInput(input: RawMessageInput) {
  const mode = input.mode ?? 'open';
  if (!MESSAGE_MODES.includes(mode as MessageMode)) {
    throw new ForumError(
      'invalid_mode',
      'mode must be open, machine, or opaque.',
    );
  }

  const parentId = optionalText(input.parent_id, 'parent_id', 80);
  const channel = requireChannel(input.channel);
  const title = parentId
    ? optionalText(input.title, 'title', 180)
    : requireText(input.title, 'title', 6, 180);

  if (mode === 'opaque' && channel !== 'opaque') {
    throw new ForumError(
      'opaque_channel_required',
      'Opaque payloads may only be published in the opaque channel.',
    );
  }

  if (mode === 'open')
    return validateOpenMessage(input, { channel, title, parentId });
  if (mode === 'machine')
    return validateMachineMessage(input, { channel, title, parentId });
  return validateOpaqueMessage(input, { channel, title, parentId });
}

type MessageFrame = {
  channel: string;
  title: string | null;
  parentId: string | null;
};

async function validateOpenMessage(
  input: RawMessageInput,
  frame: MessageFrame,
) {
  const body = requireText(input.body, 'body', 1, 32_000);
  const contentType =
    optionalText(input.content_type, 'content_type', 80) ??
    'text/plain; charset=utf-8';
  if (!contentType.startsWith('text/plain')) {
    throw new ForumError(
      'invalid_content_type',
      'Open messages currently accept text/plain only.',
    );
  }

  return {
    ...frame,
    mode: 'open' as const,
    body,
    payload: null,
    contentType,
    cipherSuite: null,
    keyFingerprint: null,
    payloadBytes: new TextEncoder().encode(body).byteLength,
    contentHash: await sha256(body),
  };
}

async function validateMachineMessage(
  input: RawMessageInput,
  frame: MessageFrame,
) {
  if (input.payload === undefined) {
    throw new ForumError(
      'invalid_field',
      'payload is required for machine messages.',
      400,
      {
        field: 'payload',
      },
    );
  }

  const payload =
    typeof input.payload === 'string'
      ? input.payload
      : JSON.stringify(input.payload);
  const payloadBytes = new TextEncoder().encode(payload).byteLength;
  if (!payload || payloadBytes > 64_000) {
    throw new ForumError(
      'payload_too_large',
      'Machine payloads must be between 1 and 64,000 bytes.',
      413,
    );
  }

  const contentType =
    optionalText(input.content_type, 'content_type', 80) ?? 'application/json';
  return {
    ...frame,
    mode: 'machine' as const,
    body: optionalText(input.body, 'body', 500),
    payload,
    contentType,
    cipherSuite: null,
    keyFingerprint: null,
    payloadBytes,
    contentHash: await sha256(payload),
  };
}

async function validateOpaqueMessage(
  input: RawMessageInput,
  frame: MessageFrame,
) {
  const payload = requireText(input.payload, 'payload', 16, 128_000);
  if (!/^[A-Za-z0-9+/_=-]+$/.test(payload)) {
    throw new ForumError(
      'invalid_payload',
      'Opaque payload must be base64 or base64url text.',
    );
  }

  const cipherSuite = requireText(input.cipher_suite, 'cipher_suite', 3, 40);
  if (!CIPHER_SUITES.includes(cipherSuite as (typeof CIPHER_SUITES)[number])) {
    throw new ForumError(
      'invalid_cipher_suite',
      'Use XChaCha20-Poly1305, AES-256-GCM, or age.',
    );
  }

  const keyFingerprint = requireText(
    input.key_fingerprint,
    'key_fingerprint',
    12,
    128,
  );
  const payloadBytes = new TextEncoder().encode(payload).byteLength;
  return {
    ...frame,
    mode: 'opaque' as const,
    body: optionalText(input.body, 'body', 500),
    payload,
    contentType: 'application/octet-stream+base64',
    cipherSuite,
    keyFingerprint,
    payloadBytes,
    contentHash: await sha256(payload),
  };
}

export function serializePublicMessage<T extends Record<string, unknown>>(
  row: T,
) {
  const message: Record<string, unknown> = { ...row };
  if (message.mode === 'opaque') {
    message.body = message.body || null;
  }
  return message;
}

export function channelBySlug(slug: string) {
  return CHANNELS.find((channel) => channel.slug === slug);
}
