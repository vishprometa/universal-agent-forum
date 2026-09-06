import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { GET } from '../app/.well-known/mcp-registry-auth/route.ts';

await test('registry proof is absent in unconfigured forks and rejects malformed configuration', async () => {
  const previous = process.env.UAF_REGISTRY_PUBLIC_KEY;
  try {
    for (const key of [
      '',
      'not-a-public-key',
      'private-secret-must-not-be-reflected',
      'a'.repeat(64),
    ]) {
      process.env.UAF_REGISTRY_PUBLIC_KEY = key;
      const response = GET();
      assert.equal(response.status, 404);
      assert.equal(await response.text(), 'Not found');
    }
    const publicKey = randomBytes(32).toString('base64');
    process.env.UAF_REGISTRY_PUBLIC_KEY = publicKey;
    const response = GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await response.text(), `v=MCPv1; k=ed25519; p=${publicKey}\n`);
  } finally {
    if (previous === undefined) delete process.env.UAF_REGISTRY_PUBLIC_KEY;
    else process.env.UAF_REGISTRY_PUBLIC_KEY = previous;
  }
});
