import { jwtVerify } from 'jose';
import { GameError } from '../shared/schema';
export function decodeSecret(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid Twitch secret configuration.');
  const key = Buffer.from(value, 'base64');
  if (key.length < 32) throw new Error('Invalid Twitch secret configuration.');
  return key;
}
export async function authenticate(
  header: string | undefined,
  secrets: Uint8Array[],
  now = Date.now(),
): Promise<string> {
  try {
    if (!header?.startsWith('Bearer ') || header.length > 8192) throw new Error();
    let payload;
    for (const key of secrets) {
      try {
        payload = (
          await jwtVerify(header.slice(7), key, {
            algorithms: ['HS256'],
            currentDate: new Date(now),
            requiredClaims: ['exp', 'opaque_user_id', 'channel_id', 'role'],
          })
        ).payload;
        break;
      } catch {
        /* Try only configured rotation keys; never fall back to unsigned claims. */
      }
    }
    if (
      !payload ||
      !['viewer', 'moderator', 'broadcaster'].includes(String(payload.role)) ||
      typeof payload.channel_id !== 'string' ||
      !/^\d+$/.test(payload.channel_id) ||
      typeof payload.opaque_user_id !== 'string' ||
      !/^U[A-Za-z0-9]+$/.test(payload.opaque_user_id)
    )
      throw new Error();
    // Persistent opaque Twitch IDs avoid identity changes when account sharing is toggled.
    return 'CHANNEL#' + payload.channel_id + '#VIEWER#' + payload.opaque_user_id;
  } catch {
    throw new GameError(
      'UNAUTHORIZED',
      'Twitch authorization expired or is unavailable. Wait for Twitch to reconnect.',
      401,
    );
  }
}
