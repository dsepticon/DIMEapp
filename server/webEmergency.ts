import { z } from 'zod';
import { DeletionAuthorizationError } from './accountDeletion';
import { WebAuthError, type WebAuth } from './webAuth';
import type { Request } from './http';
import type { WebResponse } from './webHttp';

export const webOrigin = 'https://destroyaindustriesminingextension.com';
export const expiredAuthCookies = [
  '__Host-dime-session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
  '__Host-dime-login=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
  '__Host-dime-invitation=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
];
function cookie(header: string | undefined, name: string) {
  const values = (header ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + '='));
  return values.length === 1 ? values[0]!.slice(name.length + 1) : '';
}

/** Parse unauthenticated input before constructing any credential/storage dependency. */
export async function emergencyRoute(
  request: Request,
  configure: () => WebAuth | Promise<WebAuth>,
  internalFailure?: (error: unknown) => WebResponse,
): Promise<WebResponse | undefined> {
  const path = request.path.split('?')[0];
  if (request.method !== 'POST' || !['/auth/logout', '/auth/delete/resume'].includes(path ?? '')) return;
  const logout = path === '/auth/logout';
  const result = (body: unknown, statusCode = 200): WebResponse => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
    ...(logout ? { cookies: expiredAuthCookies } : {}),
    body: JSON.stringify(body),
  });
  try {
    if (logout) {
      const sid = cookie(request.headers.cookie, '__Host-dime-session');
      if (!/^[\w-]{43}$/.test(sid)) return result({ signedOut: true });
      await (
        await configure()
      ).logout(sid, { origin: request.headers.origin, csrf: request.headers['x-dime-csrf'] });
      return result({ signedOut: true });
    }
    if (request.headers.origin !== webOrigin) throw new WebAuthError(403);
    let raw: unknown;
    try {
      raw = JSON.parse(request.body ?? '{}');
    } catch {
      throw new WebAuthError(401);
    }
    const stored = cookie(request.headers.cookie, '__Host-dime-deletion').split('.');
    const input = z
      .object({ account: z.uuid(), capability: z.string().regex(/^[\w-]{43}$/) })
      .strict()
      .safeParse(
        raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0
          ? { account: stored[0], capability: stored[1] }
          : raw,
      );
    if (!input.success) throw new WebAuthError(401);
    const auth = await configure();
    const resumed = await auth.resumeDeletion(input.data.account, input.data.capability);
    return {
      ...result(resumed, 'retryable' in resumed ? 202 : 200),
      ...(resumed.status === 'COMPLETE' ? { cookies: [auth.cookie('deletion', '', 0)] } : {}),
    };
  } catch (error) {
    const status =
      error instanceof WebAuthError ? error.status : error instanceof DeletionAuthorizationError ? 403 : 503;
    if (status === 503 && internalFailure) {
      const failure = internalFailure(error);
      return { ...failure, ...(logout ? { cookies: expiredAuthCookies } : {}) };
    }
    return result(
      {
        code: status === 503 ? 'RECOVERY_UNAVAILABLE' : 'UNAUTHORIZED',
        message:
          status === 503
            ? 'Recovery is temporarily unavailable. Retry safely.'
            : 'Authentication could not be completed.',
      },
      status,
    );
  }
}
