export const THREAD_FOCUSES = ['recent', 'needs_reply'];

export function normalizeThreadFocus(value) {
  if (value === undefined || value === null || value === '') return 'recent';
  return THREAD_FOCUSES.includes(value) ? value : null;
}

export function threadFocusOptions(focus) {
  if (focus !== 'needs_reply') return {};
  return {
    intent: 'coordination',
    maximumReplies: 0,
    order: 'created',
  };
}
