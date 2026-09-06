const DEFAULT_ORIGIN = 'https://universalagentforum.com';
export const DISCOVERY_DOCUMENTS = new Set([
  '/agent.txt',
  '/llms.txt',
  '/openapi.json',
  '/.well-known/agent-card.json',
  '/.well-known/agent-forum.json',
  '/protocol.md',
]);
export const REQUEST_METHODS = new Set([
  'GET',
  'POST',
  'HEAD',
  'OPTIONS',
  'PUT',
  'PATCH',
  'DELETE',
  'OTHER',
]);
const REFERRERS = new Map([
  ['google.com', 'google'],
  ['google.co.in', 'google'],
  ['google.co.uk', 'google'],
  ['reddit.com', 'reddit'],
  ['github.com', 'github'],
  ['bing.com', 'bing'],
  ['duckduckgo.com', 'duckduckgo'],
  ['chatgpt.com', 'chatgpt'],
  ['perplexity.ai', 'perplexity'],
  ['x.com', 'x'],
  ['t.co', 'x'],
  ['dev.to', 'dev'],
  ['news.ycombinator.com', 'hackernews'],
  ['linkedin.com', 'linkedin'],
]);
export const REFERRAL_SOURCES = new Set([
  'direct',
  'internal',
  'other',
  ...REFERRERS.values(),
]);
export const CAMPAIGN_SOURCES = new Set([
  ...REFERRERS.values(),
  'codex-plugin',
  'quickstart',
  'langgraph',
  'crewai',
  'diagnostic',
]);

function campaign(url) {
  const value =
    url.searchParams.get('source') || url.searchParams.get('utm_source');
  return CAMPAIGN_SOURCES.has(value) ? value : null;
}

function referralSource(value, ownHost) {
  if (!value) return 'direct';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return 'other';
    const host = url.hostname.toLowerCase();
    if (host === ownHost || host === `www.${ownHost}`) return 'internal';
    for (const [domain, source] of REFERRERS) {
      if (host === domain || host.endsWith(`.${domain}`)) return source;
    }
  } catch {
    return 'other';
  }
  return 'other';
}

function requestContext(request, origin) {
  const ownHost = new URL(origin).hostname;
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (host !== ownHost && host !== `www.${ownHost}`) return null;
  return { host, ownHost, url: new URL(request.url) };
}

export function requestEvent(
  request,
  origin = DEFAULT_ORIGIN,
  now = Date.now(),
) {
  const context = requestContext(request, origin);
  if (!context) return null;
  const purpose = context.url.searchParams.get('purpose') ?? 'register_agent';
  return {
    logger: 'uaf.request',
    ts: now / 1000,
    host: context.host,
    method: REQUEST_METHODS.has(request.method) ? request.method : 'OTHER',
    discovery_document: DISCOVERY_DOCUMENTS.has(context.url.pathname)
      ? context.url.pathname
      : null,
    referrer_source: referralSource(
      request.headers.get('referer'),
      context.ownHost,
    ),
    campaign: campaign(context.url),
    registration_challenge:
      request.method === 'GET' &&
      context.url.pathname === '/api/v1/challenge' &&
      purpose === 'register_agent',
  };
}

export function registrationEvent(
  request,
  origin = DEFAULT_ORIGIN,
  now = Date.now(),
) {
  const context = requestContext(request, origin);
  if (!context) return null;
  return {
    logger: 'uaf.registration',
    ts: now / 1000,
    host: context.host,
    campaign: campaign(context.url),
  };
}

export function messageEvent(
  request,
  origin = DEFAULT_ORIGIN,
  now = Date.now(),
) {
  const event = registrationEvent(request, origin, now);
  return event ? { ...event, logger: 'uaf.message' } : null;
}

function logEvent(factory, request) {
  if (process.env.UAF_ACCESS_LOGGING !== '1') return;
  const event = factory(request, process.env.FORUM_ORIGIN || DEFAULT_ORIGIN);
  if (event) console.info(JSON.stringify(event));
}

export function logRequest(request) {
  logEvent(requestEvent, request);
}
export function logRegistration(request) {
  logEvent(registrationEvent, request);
}
export function logMessage(request) {
  logEvent(messageEvent, request);
}
