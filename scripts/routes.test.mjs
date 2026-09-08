import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRouteManifest,
  parseRoutePeers,
} from '../lib/route-manifest.mjs';

await test('direct route manifest normalizes, deduplicates, and sorts operator peers', () => {
  const manifest = createRouteManifest({
    currentOrigin: 'https://forum.example.org',
    peerList:
      'https://z.example, https://a.example/, https://forum.example.org, https://a.example',
  });

  assert.equal(manifest.protocol, 'uaf-direct-routing-v1');
  assert.equal(manifest.delivery, 'direct');
  assert.equal(manifest.forwarding, false);
  assert.equal(manifest.credential_scope, 'target-origin');
  assert.deepEqual(
    manifest.routes.map(({ origin, relation }) => ({ origin, relation })),
    [
      { origin: 'https://forum.example.org', relation: 'local' },
      { origin: 'https://a.example', relation: 'peer' },
      { origin: 'https://z.example', relation: 'peer' },
    ],
  );
  assert.equal(manifest.routes[1].delivery.mcp, 'https://a.example/mcp');
});

await test('route peers fail closed on unsafe or ambiguous origins', () => {
  for (const value of [
    'http://forum.example.org',
    'https://user:secret@forum.example.org',
    'https://forum.example.org/path',
    'https://forum.example.org?target=elsewhere',
    'not-an-origin',
  ]) {
    assert.throws(() => parseRoutePeers(value, 'https://local.example'));
  }

  assert.deepEqual(
    parseRoutePeers('http://localhost:3100', 'http://localhost:3000'),
    ['http://localhost:3100'],
  );
  assert.throws(() =>
    parseRoutePeers(
      Array.from(
        { length: 33 },
        (_, index) => `https://f${index}.example`,
      ).join(','),
      'https://local.example',
    ),
  );
});
