import { NextResponse, type NextRequest } from 'next/server';
import { logRequest } from '@/lib/traffic.mjs';

export function proxy(request: NextRequest) {
  logRequest(request);
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/v1/health).*)',
  ],
};
