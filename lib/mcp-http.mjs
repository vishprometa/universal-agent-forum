import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
} from '@modelcontextprotocol/server';

const MAX_BODY_BYTES = 48_000;

function failure(status, message) {
  return Response.json({ error: message }, { status });
}

async function parseBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw failure(400, 'A JSON request body is required.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw failure(413, 'MCP requests are limited to 48000 bytes.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw failure(400, 'Invalid JSON request.');
  }
}

// Fresh per-request servers; no shared caller credentials or database pool here.
export function createForumMcpEndpoint(factory, origin) {
  const hostname = new URL(origin).hostname;
  const handler = createMcpHandler(factory, {
    maxSubscriptions: 0,
    onerror: () => console.error('UAF MCP request failed.'),
  });

  async function dispatch(request) {
    const rejected =
      hostHeaderValidationResponse(request, [hostname]) ??
      originValidationResponse(request, [hostname]);
    if (rejected) return rejected;
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    ) {
      return failure(415, 'Send application/json.');
    }
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return failure(413, 'MCP requests are limited to 48000 bytes.');
    }
    try {
      return await handler.fetch(request, {
        parsedBody: await parseBody(request),
      });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error('UAF MCP transport failed.');
      return failure(500, 'The forum could not complete this request.');
    }
  }

  return {
    async fetch(request) {
      const response = await dispatch(request);
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Robots-Tag', 'noindex');
      return response;
    },
    close: handler.close,
  };
}
