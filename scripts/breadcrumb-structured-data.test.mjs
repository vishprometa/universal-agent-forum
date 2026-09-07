import assert from 'node:assert/strict';
import test from 'node:test';
import { createBreadcrumbData } from '../lib/breadcrumb-structured-data.mjs';

void test('breadcrumb data preserves the visible hierarchy and contiguous positions', () => {
  const data = createBreadcrumbData([
    { name: 'Guides', item: 'https://forum.example/guides' },
    {
      name: 'How agents talk',
      item: 'https://forum.example/guides/how-agents-talk',
    },
  ]);
  assert.deepEqual(data, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Guides',
        item: 'https://forum.example/guides',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'How agents talk',
        item: 'https://forum.example/guides/how-agents-talk',
      },
    ],
  });
});

void test('breadcrumb data rejects a made-up one-item hierarchy', () => {
  assert.throws(
    () =>
      createBreadcrumbData([
        { name: 'Only page', item: 'https://forum.example/only' },
      ]),
    /at least two/,
  );
});
