import type { Request, Response } from './http';
import { parseTesterInvitation } from './testerInvitation';

/** Public capabilities never advertise invitation-only admission. */
export function webCapabilities(mode: unknown, linkingEnabled: boolean) {
  const signInAvailable = mode === 'ENABLED';
  return { signInAvailable, linkingAvailable: signInAvailable && linkingEnabled };
}

/** Runs before credential initialization, OAuth parsing and all repository access. */
export function webSignInPreflight(
  request: Pick<Request, 'method' | 'path'> & { headers?: Request['headers'] },
  mode: unknown,
  linkingEnabled: boolean,
): (Response & { cookies?: string[] }) | undefined {
  const path = new URL(request.path, 'https://localhost').pathname;
  const capabilities = webCapabilities(mode, linkingEnabled);
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (request.method === 'GET' && path === '/auth/status')
    return { statusCode: 200, headers, body: JSON.stringify(capabilities) };
  if (capabilities.signInAvailable) return;
  if (mode === 'TESTERS') {
    const url = new URL(request.path, 'https://localhost');
    if (path === '/auth/login' && request.method === 'GET') {
      try {
        if (url.searchParams.getAll('invitation').length !== 1) throw Error();
        parseTesterInvitation(url.searchParams.get('invitation') ?? '');
        return; // Signature verification is still mandatory at the handler/auth boundary.
      } catch {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Authentication could not be completed.' }),
        };
      }
    }
    if (
      path === '/auth/callback' &&
      request.method === 'GET' &&
      /(?:^|;\s*)__Host-dime-login=[\w-]{43}(?:;|$)/.test(request.headers?.cookie ?? '')
    )
      return;
    if (
      request.method === 'POST' &&
      linkingEnabled &&
      ['/auth/link/intent', '/auth/link/accept'].includes(path ?? '')
    )
      return;
  }
  // Only authentication expansion is gated. Existing authorization and privacy checks remain mandatory.
  if (!['/auth/login', '/auth/callback', '/auth/link/intent', '/auth/link/accept'].includes(path ?? ''))
    return;
  return {
    statusCode: 503,
    headers,
    ...(path === '/auth/callback'
      ? {
          cookies: [
            '__Host-dime-login=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
            '__Host-dime-invitation=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
          ],
        }
      : {}),
    body: JSON.stringify({ code: 'WEB_SIGN_IN_UNAVAILABLE', message: 'Web sign-in is not available yet' }),
  };
}
