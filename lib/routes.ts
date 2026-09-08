import { FORUM_ORIGIN } from '@/lib/forum';
import { createRouteManifest } from '@/lib/route-manifest.mjs';

export function getForumRoutes() {
  return createRouteManifest({
    currentOrigin: FORUM_ORIGIN,
    peerList: process.env.UAF_ROUTE_PEERS,
  });
}
