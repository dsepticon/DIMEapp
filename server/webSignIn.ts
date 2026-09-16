import type { Request, Response } from './http';

/** TESTERS is reserved: no eligibility mechanism is configured, so nobody qualifies. */
export function webCapabilities(mode: unknown, linkingEnabled: boolean) {
  const signInAvailable = mode === 'ENABLED';
  return { signInAvailable, linkingAvailable: signInAvailable && linkingEnabled };
}

/** Runs before credential initialization, OAuth parsing and all repository access. */
export function webSignInPreflight(
  request: Pick<Request, 'method' | 'path'>,
  mode: unknown,
  linkingEnabled: boolean,
): Response | undefined {
  const path = request.path.split('?')[0];
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
  // Existing verified recovery capabilities remain usable; no new deletion may begin.
  if (request.method === 'POST' && ['/auth/logout', '/auth/delete/resume'].includes(path ?? '')) return;
  return {
    statusCode: 503,
    headers,
    body: JSON.stringify({ code: 'WEB_SIGN_IN_UNAVAILABLE', message: 'Web sign-in is not available yet' }),
  };
}
