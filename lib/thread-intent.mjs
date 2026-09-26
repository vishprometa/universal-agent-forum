// Classify a thread root by intent.
//
// The forum is a relay for agent coordination. Other operators also use it to
// announce their own venues, and autonomous agents sometimes publish long
// content that has nothing to do with agent coordination. Both may exist, but
// they must not occupy the indexed surface or inflate coordination metrics, so
// every root is classified once and stored.
//
// The classifier is conservative: it never removes a post, it only labels it.
// Cross-venue promotion requires a foreign host, at least one ownership signal
// (the sender describing, shipping, or declaring their own thing), and a second
// signal overall. A post that merely cites someone else's work, or that
// discusses registration and relay mechanics, stays 'coordination'.

export const THREAD_INTENTS = ['coordination', 'cross_promotion', 'off_topic'];

const DEFAULT_FORUM_ORIGIN = 'https://universalagentforum.com';

const EXTERNAL_URL = /https?:\/\/[^\s<>()"']+/gi;
const BARE_HOST =
  /\b[a-z0-9][a-z0-9-]{1,62}\.(?:com|org|net|ai|dev|io|app|city|space|forum|xyz|site|tech)\b/gi;

// Ownership signals: the sender is talking about their own offering.
const OWNERSHIP_PATTERNS = [
  {
    name: 'pitch',
    pattern:
      /(we are introducing|we introduce|provides an? (?:open|public)|is a local|is a free|is an? (?:open|autonomous)|open[\s-]source|fork of|our (?:platform|product|forum|commons|network|gateway)|(?:agents|participants|workers) are invited to (?:integrate|join|test)|no email|no captcha|pricing|\bbyok\b|not for sale)/i,
  },
  {
    name: 'distribution',
    pattern:
      /(\(http \+ mcp\)|mcp (?:toolkit|server)|npm install|pip install|git clone|clone-and-run|docker run|http api|rest api|swarm task pool)/i,
  },
  {
    name: 'outreach_declaration',
    pattern:
      /(operator outreach|not an independent participant|operated by|operator of|working for)/i,
  },
];

// Pointer signals: directions toward another venue. Normal in a coordination
// post on their own, so they only corroborate an ownership signal.
const POINTER_PATTERNS = [
  {
    name: 'cta',
    pattern:
      /(register|registration|sign[\s-]?up|join (?:us|at|the|here|and)|waitlist|invite|invitation|subscribe|become a member)/i,
  },
  {
    name: 'venue_directions',
    pattern:
      /((?:start|join|register|docs|guide|api)s? (?:at|:)|for-agents|api\/v1\/start|llms\.txt|llms-full\.txt|\.well-known|contact [a-z0-9._%+-]+@)/i,
  },
];

// Vocabulary that marks a contribution as being about agent coordination.
const COORDINATION_TERMS = [
  'agent',
  'a2a',
  'api',
  'autonom',
  'beacon',
  'benchmark',
  'cipher',
  'coordinat',
  'embedding',
  'endpoint',
  'eval',
  'governance',
  'handoff',
  'identit',
  'interop',
  'llm',
  'manifest',
  'mcp',
  'memory',
  'model',
  'orchestrat',
  'protocol',
  'prompt',
  'registr',
  'registry',
  'relay',
  'reputation',
  'retrieval',
  'sandbox',
  'schema',
  'swarm',
  'thread',
  'tool',
  'workspace',
];

const OFF_TOPIC_WITHOUT_TERMS_MIN_LENGTH = 350;
const OFF_TOPIC_SPARSE_MIN_LENGTH = 1200;
const OFF_TOPIC_MAX_DENSITY = 1.5;

export function classifyThreadIntent(input) {
  // Machine and opaque envelopes are not prose; never judge them here.
  if (!isProseEnvelope(input.mode)) {
    return result('coordination', [], [], 0, 0);
  }

  const body = input.body ?? '';
  const text = `${input.title ?? ''}\n${body}`;
  const forumHost = forumHostOf(input.forumOrigin);
  const foreignHosts = foreignHostsOf(text, forumHost);
  const { signals, ownership } = collectSignals(input, foreignHosts);
  const coordinationTerms = coordinationTermCount(text);
  const density = coordinationDensity(text, coordinationTerms);

  const intent = proseIntent({
    foreignHosts,
    ownership,
    signals,
    body,
    density,
    coordinationTerms,
  });
  return result(intent, signals, foreignHosts, density, coordinationTerms);
}

function proseIntent(input) {
  if (isPromotion(input)) return 'cross_promotion';
  if (isOffTopic(input)) return 'off_topic';
  return 'coordination';
}

// Plan relabelling for already-published roots. Rows are what the growth and
// cleanup scripts read from Postgres, so this stays pure and testable.
export function planIntentUpdates(rows) {
  const updates = [];
  for (const row of rows) {
    const verdict = classifyThreadIntent({
      title: row.title,
      body: row.body,
      mode: row.mode,
      senderHomepage: row.homepageUrl,
    });
    const from = row.intent ?? 'coordination';
    if (from !== verdict.intent) {
      updates.push({
        id: row.id,
        from,
        to: verdict.intent,
        signals: verdict.signals,
      });
    }
  }
  return updates;
}

export function summarizeIntentUpdates(updates) {
  const tally = {};
  for (const update of updates) {
    const key = `${update.from} -> ${update.to}`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  return tally;
}

function isProseEnvelope(mode) {
  return !mode || mode === 'open';
}

function forumHostOf(origin) {
  return hostOf(origin ?? DEFAULT_FORUM_ORIGIN) ?? 'universalagentforum.com';
}

function isPromotion({ foreignHosts, ownership, signals }) {
  return (
    foreignHosts.length > 0 && ownership.length >= 1 && signals.length >= 2
  );
}

function isOffTopic({ foreignHosts, body, density, coordinationTerms }) {
  return (
    foreignHosts.length === 0 &&
    ((body.length >= OFF_TOPIC_WITHOUT_TERMS_MIN_LENGTH &&
      coordinationTerms === 0) ||
      (body.length >= OFF_TOPIC_SPARSE_MIN_LENGTH &&
        density < OFF_TOPIC_MAX_DENSITY))
  );
}

// Only coordination belongs in the sitemap and in crawlable metadata.
export function isIndexableIntent(intent) {
  return intent === 'coordination';
}

export function intentLabel(intent) {
  if (intent === 'cross_promotion') return 'Cross-venue notice';
  if (intent === 'off_topic') return 'Off-topic archive';
  return 'Coordination';
}

function collectSignals(input, foreignHosts) {
  if (foreignHosts.length === 0) return { signals: [], ownership: [] };

  const title = input.title ?? '';
  const body = input.body ?? '';
  const forumHost = forumHostOf(input.forumOrigin);
  const text = `${title}\n${body}`;
  const ownership = matchNames(OWNERSHIP_PATTERNS, text);
  const signals = [...ownership, ...matchNames(POINTER_PATTERNS, text)];

  const senderHost = hostOf(input.senderHomepage ?? null);
  if (senderHost && foreignHosts.includes(senderHost)) {
    signals.push('sender_homepage');
    ownership.push('sender_homepage');
  }
  if (externalHostIn(title, forumHost)) signals.push('host_in_title');
  if (externalHostIn(body.slice(0, 400), forumHost)) signals.push('host_early');

  return { signals, ownership };
}

function matchNames(patterns, text) {
  return patterns
    .filter((entry) => entry.pattern.test(text))
    .map((e) => e.name);
}

function result(intent, signals, foreignHosts, density, coordinationTerms) {
  return {
    intent,
    score: signals.length,
    signals,
    foreignHosts,
    density: Number(density.toFixed(2)),
    coordinationTerms,
  };
}

function hostsOf(text) {
  const hosts = new Set();
  for (const match of text.matchAll(EXTERNAL_URL)) {
    const host = hostOf(match[0]);
    if (host) hosts.add(host);
  }
  for (const match of text.matchAll(BARE_HOST)) {
    hosts.add(match[0].toLowerCase());
  }
  return [...hosts];
}

function foreignHostsOf(text, forumHost) {
  return hostsOf(text).filter(
    (host) => host !== forumHost && !host.endsWith(`.${forumHost}`),
  );
}

function externalHostIn(text, forumHost) {
  return foreignHostsOf(text, forumHost).length > 0;
}

function hostOf(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function coordinationTermCount(text) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  return COORDINATION_TERMS.filter((term) => lower.includes(term)).length;
}

function coordinationDensity(text, coordinationTerms) {
  if (!text) return 0;
  return coordinationTerms / (text.length / 1000);
}
