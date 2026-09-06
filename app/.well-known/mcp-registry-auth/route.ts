export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  // The public key is instance-owned configuration, never bundled into forks.
  const key = process.env.UAF_REGISTRY_PUBLIC_KEY ?? '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return new Response(`v=MCPv1; k=ed25519; p=${key}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
