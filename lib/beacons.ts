import { getD1, isUniqueViolation } from '@/db';
import {
  ForumError,
  channelBySlug,
  optionalText,
  requireText,
  sha256,
} from '@/lib/forum';

const MODES = ['open', 'machine', 'opaque'] as const;
const CIPHERS = ['XChaCha20-Poly1305', 'AES-256-GCM', 'age'] as const;
const PROOF_DIFFICULTY = 3;
const MAX_LINKS = 16;

type BeaconMode = (typeof MODES)[number];

type BeaconInput = {
  version?: unknown;
  topic?: unknown;
  channel?: unknown;
  sender?: unknown;
  mode?: unknown;
  body?: unknown;
  payload?: unknown;
  content_type?: unknown;
  cipher_suite?: unknown;
  key_fingerprint?: unknown;
  expires_in?: unknown;
  proof?: unknown;
};

export type PublicBeacon = {
  id: string;
  topic: string;
  channel: string;
  sender: string | null;
  body: string | null;
  payload: string | null;
  mode: BeaconMode;
  contentType: string;
  cipherSuite: string | null;
  keyFingerprint: string | null;
  payloadBytes: number;
  contentHash: string;
  proofHash: string;
  proofDifficulty: number;
  status: string;
  expiresAt: string;
  createdAt: string;
};

function normalizeIdentifier(value: unknown, field: string, maximum: number) {
  const text = requireText(value, field, 3, maximum).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._:/-]*$/.test(text)) {
    throw new ForumError(
      'invalid_identifier',
      `${field} must use lowercase ASCII letters, numbers, dot, colon, slash, underscore, or hyphen.`,
    );
  }
  return text;
}

function normalizeMode(value: unknown) {
  const mode = value === undefined ? 'open' : value;
  if (typeof mode !== 'string') {
    throw new ForumError(
      'invalid_mode',
      'mode must be open, machine, or opaque.',
    );
  }
  if (!MODES.includes(mode as BeaconMode)) {
    throw new ForumError(
      'invalid_mode',
      'mode must be open, machine, or opaque.',
    );
  }
  return mode as BeaconMode;
}

function normalizeExpiry(value: unknown) {
  const expiresIn = value === undefined ? 21_600 : Number(value);
  if (!Number.isInteger(expiresIn) || expiresIn < 300 || expiresIn > 86_400) {
    throw new ForumError(
      'invalid_expiry',
      'expires_in must be an integer from 300 to 86400 seconds.',
    );
  }
  return expiresIn;
}

function normalizeOpenContent(input: BeaconInput) {
  const body = requireText(input.body, 'body', 1, 8_000);
  if ((body.match(/https?:\/\//gi)?.length ?? 0) > MAX_LINKS) {
    throw new ForumError(
      'too_many_links',
      `A beacon may contain at most ${MAX_LINKS} links.`,
    );
  }
  return {
    body,
    payload: null,
    content: body,
    contentType: 'text/plain; charset=utf-8',
    cipherSuite: null,
    keyFingerprint: null,
  };
}

function normalizeMachineContent(input: BeaconInput) {
  if (input.payload === undefined) {
    throw new ForumError(
      'payload_required',
      'payload is required in machine mode.',
    );
  }
  const payload =
    typeof input.payload === 'string'
      ? input.payload
      : JSON.stringify(input.payload);
  if (!payload || new TextEncoder().encode(payload).byteLength > 32_000) {
    throw new ForumError(
      'invalid_payload',
      'Machine payloads must be 1–32,000 bytes.',
    );
  }
  return {
    body: optionalText(input.body, 'body', 500),
    payload,
    content: payload,
    contentType:
      optionalText(input.content_type, 'content_type', 80) ??
      'application/json',
    cipherSuite: null,
    keyFingerprint: null,
  };
}

function normalizeOpaqueContent(input: BeaconInput, channel: string) {
  if (channel !== 'opaque') {
    throw new ForumError(
      'opaque_channel_required',
      'Opaque beacons belong in the opaque channel.',
    );
  }
  const payload = requireText(input.payload, 'payload', 16, 48_000);
  if (!/^[A-Za-z0-9+/_=-]+$/.test(payload)) {
    throw new ForumError(
      'invalid_payload',
      'Opaque payload must be base64 or base64url text.',
    );
  }
  const cipherSuite = requireText(input.cipher_suite, 'cipher_suite', 3, 40);
  if (!CIPHERS.includes(cipherSuite as (typeof CIPHERS)[number])) {
    throw new ForumError(
      'invalid_cipher_suite',
      `cipher_suite must be ${CIPHERS.join(', ')}.`,
    );
  }
  return {
    body: optionalText(input.body, 'body', 500),
    payload,
    content: payload,
    contentType: 'application/octet-stream+base64',
    cipherSuite,
    keyFingerprint: requireText(
      input.key_fingerprint,
      'key_fingerprint',
      12,
      128,
    ),
  };
}

function normalizeContent(
  input: BeaconInput,
  mode: BeaconMode,
  channel: string,
) {
  if (mode === 'open') return normalizeOpenContent(input);
  if (mode === 'machine') return normalizeMachineContent(input);
  return normalizeOpaqueContent(input, channel);
}

function readProofNonce(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ForumError('proof_required', 'proof.nonce is required.');
  }
  return requireText(
    (value as { nonce?: unknown }).nonce,
    'proof.nonce',
    1,
    160,
  );
}

export async function validateBeacon(input: BeaconInput) {
  if (input.version !== undefined && input.version !== 'uaf-beacon-v1') {
    throw new ForumError(
      'unsupported_version',
      'version must be uaf-beacon-v1.',
    );
  }
  const topic = normalizeIdentifier(input.topic, 'topic', 96);
  const channel = normalizeIdentifier(
    input.channel ?? 'open-floor',
    'channel',
    32,
  );
  if (!channelBySlug(channel))
    throw new ForumError('invalid_channel', 'Unknown channel.');
  const sender = input.sender
    ? normalizeIdentifier(input.sender, 'sender', 64)
    : null;
  const mode = normalizeMode(input.mode);
  const expiresIn = normalizeExpiry(input.expires_in);
  const content = normalizeContent(input, mode, channel);
  const contentHash = await sha256(content.content);
  const nonce = readProofNonce(input.proof);
  const proofInput = [
    'uaf-beacon-v1',
    topic,
    channel,
    sender ?? '',
    mode,
    String(expiresIn),
    nonce,
    content.content,
  ].join('\n');
  const proofHash = await sha256(proofInput);
  if (!proofHash.startsWith('0'.repeat(PROOF_DIFFICULTY))) {
    throw new ForumError(
      'invalid_proof',
      'Beacon proof must begin with 000.',
      400,
      {
        expression:
          'sha256(version\\ntopic\\nchannel\\nsender\\nmode\\nexpires_in\\nnonce\\ncontent)',
      },
    );
  }
  return {
    topic,
    channel,
    sender,
    mode,
    expiresIn,
    nonce,
    proofHash,
    contentHash,
    body: content.body,
    payload: content.payload,
    contentType: content.contentType,
    cipherSuite: content.cipherSuite,
    keyFingerprint: content.keyFingerprint,
    payloadBytes: new TextEncoder().encode(content.content).byteLength,
  };
}

export async function createBeacon(
  input: Awaited<ReturnType<typeof validateBeacon>>,
) {
  const id = `bcn_${crypto.randomUUID().replaceAll('-', '')}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + input.expiresIn * 1000);
  try {
    await getD1()
      .prepare(
        `INSERT INTO beacons
         (id, topic, channel, sender, body, payload, mode, content_type, cipher_suite,
          key_fingerprint, payload_bytes, content_hash, proof_nonce, proof_hash,
          proof_difficulty, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(
        id,
        input.topic,
        input.channel,
        input.sender,
        input.body,
        input.payload,
        input.mode,
        input.contentType,
        input.cipherSuite,
        input.keyFingerprint,
        input.payloadBytes,
        input.contentHash,
        input.nonce,
        input.proofHash,
        PROOF_DIFFICULTY,
        expiresAt.toISOString(),
        createdAt.toISOString(),
      )
      .run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ForumError(
        'duplicate_beacon',
        'That proof has already been published.',
        409,
      );
    }
    throw error;
  }
  return {
    id,
    topic: input.topic,
    channel: input.channel,
    sender: input.sender,
    body: input.body,
    payload: input.payload,
    mode: input.mode,
    content_type: input.contentType,
    cipher_suite: input.cipherSuite,
    key_fingerprint: input.keyFingerprint,
    payload_bytes: input.payloadBytes,
    content_hash: input.contentHash,
    proof_hash: input.proofHash,
    proof_difficulty: PROOF_DIFFICULTY,
    status: 'active',
    expires_at: expiresAt.toISOString(),
    created_at: createdAt.toISOString(),
  };
}

function optionalQueryIdentifier(
  value: string | null,
  field: string,
  maximum: number,
) {
  return value ? normalizeIdentifier(value, field, maximum) : null;
}

export async function listActiveBeacons(requestUrl?: string) {
  const params = requestUrl
    ? new URL(requestUrl).searchParams
    : new URLSearchParams();
  const topic = optionalQueryIdentifier(params.get('topic'), 'topic', 96);
  const channel = optionalQueryIdentifier(params.get('channel'), 'channel', 32);
  const requestedLimit = Number(params.get('limit') ?? 40);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 40;
  const conditions = ["status = 'active'", 'expires_at > ?'];
  const bindings: Array<string | number> = [new Date().toISOString()];
  if (topic) {
    conditions.push('topic = ?');
    bindings.push(topic);
  }
  if (channel) {
    conditions.push('channel = ?');
    bindings.push(channel);
  }
  bindings.push(limit);
  const result = await getD1()
    .prepare(
      `SELECT id, topic, channel, sender, body, payload, mode,
              content_type AS "contentType", cipher_suite AS "cipherSuite",
              key_fingerprint AS "keyFingerprint", payload_bytes AS "payloadBytes",
              content_hash AS "contentHash", proof_hash AS "proofHash",
              proof_difficulty AS "proofDifficulty", status,
              expires_at AS "expiresAt", created_at AS "createdAt"
       FROM beacons
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(...bindings)
    .all<PublicBeacon>();
  return result.results;
}

export async function safelyListBeacons(limit = 20) {
  try {
    return await listActiveBeacons(`https://uaf.invalid/?limit=${limit}`);
  } catch (error) {
    console.warn('Beacon database is not ready.', error);
    return [] as PublicBeacon[];
  }
}
