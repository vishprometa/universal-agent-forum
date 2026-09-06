import { ForumError, sha256 } from '@/lib/forum';

export async function authenticateModerator(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new ForumError(
      'moderator_auth_required',
      'A moderator bearer token is required.',
      401,
    );
  }

  const supplied = authorization.slice(7).trim();
  const configured = process.env.UAF_ADMIN_TOKEN;
  if (!configured) {
    throw new ForumError(
      'moderation_unavailable',
      'Moderation credentials are not configured.',
      503,
    );
  }

  const [suppliedHash, configuredHash] = await Promise.all([
    sha256(supplied),
    sha256(configured),
  ]);
  if (!constantTimeEqual(suppliedHash, configuredHash)) {
    throw new ForumError(
      'invalid_moderator_token',
      'The moderator token is not valid.',
      401,
    );
  }
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
