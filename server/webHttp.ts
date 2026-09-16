import { disabledConversionGate, type ConversionGate } from './conversionGate';
import { WebAuth, WebAuthError } from './webAuth';
import { createOriginalApi } from './originalApi';
import { z } from 'zod';
import type { Request, Response } from './http';
export type WebResponse = Response & { cookies?: string[] };
function cookie(header: string | undefined, name: string) {
  const values = (header ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(name + '='));
  return values.length === 1 ? values[0]!.slice(name.length + 1) : '';
}
/** Same-origin reverse proxy only. Query strings and cookie headers MUST be excluded from access logs. */
export function createWebApi(
  auth: WebAuth,
  extension?: {
    authorize: (header: string | undefined) => Promise<string>;
    origins: string[];
    linkingEnabled: boolean;
  },
  conversionGate: ConversionGate = disabledConversionGate,
) {
  return async (request: Request): Promise<WebResponse> => {
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    const url = new URL(request.path, auth.origin),
      path = url.pathname;
    const sid = cookie(request.headers.cookie, '__Host-dime-session');
    const result = (body: unknown, statusCode = 200): WebResponse => ({
      statusCode,
      headers,
      body: JSON.stringify(body),
    });
    const redirect = (location: string, cookies: string[] = []): WebResponse => ({
      statusCode: 303,
      headers: { ...headers, Location: location },
      cookies,
      body: '',
    });
    try {
      if (request.method === 'GET' && path === '/auth/login') {
        const login = await auth.begin();
        return redirect(login.location, [login.cookie]);
      }
      if (request.method === 'GET' && path === '/auth/callback') {
        if (
          url.searchParams.getAll('code').length !== 1 ||
          url.searchParams.getAll('state').length !== 1 ||
          url.searchParams.has('error')
        )
          throw new WebAuthError();
        const login = await auth.callback(
          url.searchParams.get('code')!,
          url.searchParams.get('state')!,
          cookie(request.headers.cookie, '__Host-dime-login'),
          sid,
        );
        return redirect(login.location, [login.cookie, login.clearLogin]);
      }
      const mutation = { origin: request.headers.origin, csrf: request.headers['x-dime-csrf'] };
      if (
        request.method === 'POST' &&
        request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json'
      )
        throw new WebAuthError(403);
      if ((request.body?.length ?? 0) > 16384) return result({ message: 'Request is too large.' }, 413);
      if (request.method === 'GET' && path === '/auth/session') {
        const session = await auth.authorize(sid);
        return result({
          identity: session.account,
          csrf: session.csrf,
          linkingAvailable: extension?.linkingEnabled === true,
          profileExists: (await auth.gameStore(session).read(session.player)) !== undefined,
        });
      }
      if (request.method === 'POST' && path === '/auth/logout')
        return { ...result({ signedOut: true }), cookies: [await auth.logout(sid, mutation)] };
      if (extension?.linkingEnabled && path === '/auth/link/intent' && request.method === 'POST')
        return result({ intent: await auth.createLink(sid, mutation), expiresIn: 300 });
      if (extension?.linkingEnabled && path === '/auth/link/accept' && request.method === 'POST') {
        if (!extension.origins.includes(request.headers.origin ?? '')) throw new WebAuthError(403);
        const player = await extension.authorize(request.headers.authorization);
        const input = z
          .object({ intent: z.string().regex(/^[\w-]{43}$/) })
          .strict()
          .parse(JSON.parse(request.body ?? ''));
        return result(await auth.acceptLink(input.intent, player));
      }
      if (extension?.linkingEnabled && request.method === 'POST' && path === '/auth/unlink') {
        const input = z
          .object({ confirmation: z.literal('UNLINK_EXTENSION') })
          .strict()
          .parse(JSON.parse(request.body ?? ''));
        return result(await auth.unlink(sid, mutation, input.confirmation));
      }
      if (extension?.linkingEnabled && request.method === 'POST' && path === '/auth/delete/intent') {
        const input = z
          .object({ confirmation: z.literal('DELETE_ACCOUNT'), capability: z.string().regex(/^[\w-]{43}$/) })
          .strict()
          .parse(JSON.parse(request.body ?? ''));
        const started = await auth.beginDeletion(sid, mutation, input.confirmation, input.capability);
        return {
          ...result(started),
          cookies: [auth.cookie('deletion', started.account + '.' + input.capability, 35 * 86400)],
        };
      }
      if (request.method === 'POST' && path === '/auth/delete/resume') {
        if (request.headers.origin !== auth.origin) throw new WebAuthError(403);
        const raw = JSON.parse(request.body ?? '{}');
        const stored = cookie(request.headers.cookie, '__Host-dime-deletion').split('.');
        const input = z
          .object({ account: z.uuid(), capability: z.string().regex(/^[\w-]{43}$/) })
          .strict()
          .parse(Object.keys(raw).length ? raw : { account: stored[0], capability: stored[1] });
        const resumed = await auth.resumeDeletion(input.account, input.capability);
        return {
          ...result(resumed),
          ...(resumed.status === 'COMPLETE' ? { cookies: [auth.cookie('deletion', '', 0)] } : {}),
        };
      }
      if (path.startsWith('/api/v4/') && ['GET', 'POST'].includes(request.method)) {
        const session = await auth.authorize(sid, request.method === 'POST' ? mutation : undefined);
        const game = createOriginalApi(
          auth.gameStore(session),
          async () => session.player,
          [auth.origin],
          Date.now,
          conversionGate,
        );
        return game({
          ...request,
          path: path.slice(4),
          headers: { origin: auth.origin },
          body: request.body,
        });
      }
      return result({ message: 'Endpoint not found.' }, 404);
    } catch (error) {
      if (path === '/auth/callback')
        return redirect(auth.origin + '/?auth=failed', [auth.cookie('login', '', 0)]);
      return result(
        {
          message:
            error instanceof WebAuthError && error.code === 'LINK_CONFLICT'
              ? 'Both identities have existing profiles or a conflicting link. Contact support; no saves were changed.'
              : 'Authentication could not be completed.',
          ...(error instanceof WebAuthError && error.code ? { code: error.code } : {}),
        },
        error instanceof WebAuthError ? error.status : 503,
      );
    }
  };
}
