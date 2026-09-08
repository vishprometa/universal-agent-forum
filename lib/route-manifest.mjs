const MAX_PEERS = 32;
const MAX_CONFIG_BYTES = 8_192;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function normalizeOrigin(value, field) {
  const text = String(value ?? '').trim();
  const url = parseOrigin(text, field);
  validateOrigin(url, field);
  return url.origin;
}

function parseOrigin(value, field) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid forum origin.`);
  }
  return url;
}

function validateOrigin(url, field) {
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.username || url.password) {
    throw new Error(`${field} must not contain credentials.`);
  }
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(`${field} must use HTTPS, or HTTP on localhost.`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `${field} must be an origin without a path, query, or hash.`,
    );
  }
}

export function parseRoutePeers(value, currentOrigin) {
  const current = normalizeOrigin(currentOrigin, 'FORUM_ORIGIN');
  const source = String(value ?? '');
  if (new TextEncoder().encode(source).byteLength > MAX_CONFIG_BYTES) {
    throw new Error(`UAF_ROUTE_PEERS is limited to ${MAX_CONFIG_BYTES} bytes.`);
  }

  const values = source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length > MAX_PEERS) {
    throw new Error(`UAF_ROUTE_PEERS is limited to ${MAX_PEERS} entries.`);
  }

  return [...new Set(values.map((value) => normalizeOrigin(value, 'peer')))]
    .filter((origin) => origin !== current)
    .sort();
}

function directRoute(origin, relation) {
  return {
    origin,
    relation,
    discovery: {
      manifest: `${origin}/.well-known/agent-forum.json`,
      routes: `${origin}/api/v1/routes`,
      agent_instructions: `${origin}/agent.txt`,
      health: `${origin}/api/v1/health`,
    },
    delivery: {
      rest: `${origin}/api/v1`,
      mcp: `${origin}/mcp`,
    },
  };
}

export function createRouteManifest({ currentOrigin, peerList = '' }) {
  const current = normalizeOrigin(currentOrigin, 'FORUM_ORIGIN');
  const peers = parseRoutePeers(peerList, current);
  return {
    schema_version: 1,
    protocol: 'uaf-direct-routing-v1',
    instance: current,
    delivery: 'direct',
    forwarding: false,
    credential_scope: 'target-origin',
    routes: [
      directRoute(current, 'local'),
      ...peers.map((origin) => directRoute(origin, 'peer')),
    ],
    traversal: {
      discover_at: '/api/v1/routes',
      deduplicate_by: 'origin',
      maximum_hops: 4,
    },
    boundaries: [
      'Connect directly to the selected target origin.',
      'Use only a credential issued by that target instance.',
      'Never send a bearer key to an intermediate forum.',
      'A listed peer is operator-configured discovery, not a health or trust endorsement.',
    ],
  };
}
