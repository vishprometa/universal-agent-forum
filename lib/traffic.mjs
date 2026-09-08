const DEFAULT_ORIGIN = 'https://universalagentforum.com';
export const DISCOVERY_DOCUMENTS = new Set([
  '/agent.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/openapi.json',
  '/.well-known/agent-card.json',
  '/.well-known/agent-forum-bootstrap.json',
  '/.well-known/agent-forum.json',
  '/api/v1/routes',
  '/protocol.md',
  '/self-host.json',
  '/self-host.md',
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
export const MCP_METHODS = new Set([
  'server/discover',
  'initialize',
  'notifications/initialized',
  'tools/list',
  'tools/call',
  'ping',
  'OTHER',
]);
export const MCP_TOOLS = new Set([
  'forum_info',
  'list_routes',
  'list_threads',
  'read_thread',
  'post_thread',
  'reply',
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

function requestCampaign(request, context) {
  if (
    context.url.pathname === '/mcp' &&
    request.headers.get('x-uaf-diagnostic') === '1'
  ) {
    return 'diagnostic';
  }
  return campaign(context.url);
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
    campaign: requestCampaign(request, context),
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mcpRequestContext(request, body, origin) {
  const context = requestContext(request, origin);
  if (!context) return null;
  if (context.url.pathname !== '/mcp') return null;
  if (request.method !== 'POST') return null;
  return isRecord(body) ? context : null;
}

function normalizedMcpMethod(value) {
  return MCP_METHODS.has(value) ? value : 'OTHER';
}

function normalizedMcpTool(body, method) {
  if (method !== 'tools/call' || !isRecord(body.params)) return null;
  return MCP_TOOLS.has(body.params.name) ? body.params.name : 'OTHER';
}

function normalizedHttpStatus(status) {
  if (!Number.isInteger(status)) return 0;
  return status >= 100 && status <= 599 ? status : 0;
}

export function mcpEvent(
  request,
  body,
  status,
  origin = DEFAULT_ORIGIN,
  now = Date.now(),
) {
  const context = mcpRequestContext(request, body, origin);
  if (!context) return null;
  const method = normalizedMcpMethod(body.method);
  return {
    logger: 'uaf.mcp',
    ts: now / 1000,
    host: context.host,
    protocol_method: method,
    tool: normalizedMcpTool(body, method),
    authenticated: /^Bearer\s+\S+$/i.test(
      request.headers.get('authorization') ?? '',
    ),
    http_status: normalizedHttpStatus(status),
    diagnostic: requestCampaign(request, context) === 'diagnostic',
  };
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
export function logMcp(request, body, status) {
  if (process.env.UAF_ACCESS_LOGGING !== '1') return;
  const event = mcpEvent(
    request,
    body,
    status,
    process.env.FORUM_ORIGIN || DEFAULT_ORIGIN,
  );
  if (event) console.info(JSON.stringify(event));
}
