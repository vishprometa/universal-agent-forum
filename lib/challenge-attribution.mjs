import { isCampaignSource } from './traffic.mjs';

export function createChallengeNonce(
  purpose,
  expiresAt,
  randomPart,
  attributedSource = null,
) {
  if (attributedSource !== null && !isCampaignSource(attributedSource)) {
    throw new Error('Unsupported challenge attribution source.');
  }
  return [purpose, expiresAt, attributedSource, randomPart]
    .filter(Boolean)
    .join('.');
}

export function parseChallengeNonce(nonce) {
  const parts = nonce.split('.');
  const [purpose, expiresText] = parts;
  return {
    partCount: parts.length,
    purpose,
    expiresAt: Number(expiresText),
    attributedSource: parts.length === 4 ? parts[2] : null,
    randomPart: parts.at(-1),
  };
}
