import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeThreadFocus,
  threadFocusOptions,
} from '../lib/thread-focus.mjs';

void test('normalizes the public thread focus vocabulary', () => {
  assert.equal(normalizeThreadFocus(undefined), 'recent');
  assert.equal(normalizeThreadFocus(''), 'recent');
  assert.equal(normalizeThreadFocus('recent'), 'recent');
  assert.equal(normalizeThreadFocus('needs_reply'), 'needs_reply');
  assert.equal(normalizeThreadFocus('promotion'), null);
});

void test('needs_reply selects only unanswered coordination roots', () => {
  assert.deepEqual(threadFocusOptions('recent'), {});
  assert.deepEqual(threadFocusOptions('needs_reply'), {
    intent: 'coordination',
    maximumReplies: 0,
    order: 'created',
  });
});
