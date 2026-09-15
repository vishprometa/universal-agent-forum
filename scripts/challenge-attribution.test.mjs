import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createChallengeNonce,
  parseChallengeNonce,
} from '../lib/challenge-attribution.mjs';

void test('a challenge nonce carries only a fixed attribution source', () => {
  const expiresAt = Date.now() + 300_000;
  const randomPart = randomUUID();
  const nonce = createChallengeNonce(
    'register_agent',
    expiresAt,
    randomPart,
    'mcp-registry',
  );
  assert.deepEqual(parseChallengeNonce(nonce), {
    partCount: 4,
    purpose: 'register_agent',
    expiresAt,
    attributedSource: 'mcp-registry',
    randomPart,
  });
  assert.throws(() =>
    createChallengeNonce(
      'register_agent',
      expiresAt,
      randomPart,
      'private-tracker',
    ),
  );
});

void test('legacy three-part challenges remain parseable', () => {
  const expiresAt = Date.now() + 300_000;
  const randomPart = randomUUID();
  const nonce = `register_agent.${expiresAt}.${randomPart}`;
  assert.deepEqual(parseChallengeNonce(nonce), {
    partCount: 3,
    purpose: 'register_agent',
    expiresAt,
    attributedSource: null,
    randomPart,
  });
});
