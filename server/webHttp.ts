import { opaque } from './webAuth';
import { InvitationError } from './testerInvitation';
import { emergencyRoute } from './webEmergency';
import { webSignInPreflight } from './webSignIn';
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
    linkingMode?: () => unknown;
  },
  conversionGate: ConversionGate = disabledConversionGate,
  signInMode: () => unknown = () => undefined,
  internalFailure?: (error: unknown) => WebResponse,
) {
  return async (request: Request): Promise<WebResponse> => {
    const mode = signInMode();
    const linkMode = extension?.linkingMode
      ? extension.linkingMode()
      : extension?.linkingEnabled
        ? 'ENABLED'
        : 'DISABLED';
    const linksConfigured = linkMode === 'ENABLED' || linkMode === 'TESTERS';
    const preflight = webSignInPreflight(request, mode, linksConfigured);
    if (preflight) return preflight;
    const emergency = await emergencyRoute(request, () => auth, internalFailure);
    if (emergency) return emergency;
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
        if (mode !== 'ENABLED' && mode !== 'TESTERS') throw new WebAuthError(503);
        const invitations = url.searchParams.getAll('invitation');
        if (invitations.length > 1 || (mode === 'TESTERS' && invitations.length !== 1))
          throw new WebAuthError();
        const login = await auth.begin(mode === 'TESTERS' ? invitations[0] : undefined);
        return redirect(login.location, [login.cookie]);
      }
      if (request.method === 'GET' && path === '/auth/callback') {
        if (mode !== 'ENABLED' && mode !== 'TESTERS') throw new WebAuthError(503);
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
          mode === 'TESTERS',
        );
        return redirect(login.location, [
          login.cookie,
          login.clearLogin,
          '__Host-dime-invitation=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
        ]);
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
        if (mode === 'TESTERS' && (session.testerUntil ?? 0) <= Date.now()) throw new WebAuthError();
        const linkingAvailable =
          linksConfigured && (linkMode !== 'TESTERS' || (session.testerUntil ?? 0) > Date.now());
        if (url.searchParams.get('view') === 'tester') {
          const nonce = opaque();
          return {
            statusCode: 200,
            headers: {
              ...headers,
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
            },
            body: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DIME tester sign-in</title><main><h1>Tester signed in</h1><p>${linkingAvailable ? 'Shared-save linking requires separate deliberate confirmation.' : 'Shared-save linking is not enabled. No gameplay save has been created or changed by this sign-in.'}</p><a href="/game/">Play Guest Demo — progress is not saved</a><button id="logout">Sign out</button><p id="result" role="status"></p></main><script nonce="${nonce}">document.getElementById('logout').onclick=async()=>{const r=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Dime-CSRF':${JSON.stringify(session.csrf)}},body:'{}'});document.getElementById('result').textContent=r.ok?'Signed out.':'Sign-out could not be completed. Retry.';};</script></html>`,
          };
        }
        return result({
          identity: session.account,
          csrf: session.csrf,
          linkingAvailable,
          gameplayAvailable: linkingAvailable && (linkMode !== 'TESTERS' || session.linked),
          message: linkingAvailable
            ? 'Shared-save access requires verified linking.'
            : 'Signed in. Shared-save linking is not enabled.',
          profileExists:
            linkingAvailable && (await auth.gameStore(session).read(session.player)) !== undefined,
        });
      }

      if (linksConfigured && path === '/auth/link/intent' && request.method === 'POST') {
        if (linkMode === 'TESTERS' || mode === 'TESTERS')
          z.object({ confirmation: z.literal('LINK_EXTENSION') })
            .strict()
            .parse(JSON.parse(request.body ?? ''));
        return result({
          intent: await auth.createLink(sid, mutation, linkMode === 'TESTERS' || mode === 'TESTERS'),
          expiresIn: 300,
        });
      }
      if (extension && linksConfigured && path === '/auth/link/accept' && request.method === 'POST') {
        if (!extension.origins.includes(request.headers.origin ?? '')) throw new WebAuthError(403);
        const player = await extension.authorize(request.headers.authorization);
        const input = z
          .object({ intent: z.string().regex(/^[\w-]{43}$/) })
          .strict()
          .parse(JSON.parse(request.body ?? ''));
        return result(
          await auth.acceptLink(input.intent, player, linkMode === 'TESTERS' || mode === 'TESTERS'),
        );
      }
      if (request.method === 'POST' && path === '/auth/unlink') {
        const input = z
          .object({ confirmation: z.literal('UNLINK_EXTENSION') })
          .strict()
          .parse(JSON.parse(request.body ?? ''));
        return result(await auth.unlink(sid, mutation, input.confirmation));
      }
      if (request.method === 'POST' && path === '/auth/delete/intent') {
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
      if (path.startsWith('/api/v4/') && ['GET', 'POST'].includes(request.method)) {
        if (!linksConfigured || (mode !== 'ENABLED' && mode !== 'TESTERS'))
          return result(
            { code: 'SHARED_SAVES_UNAVAILABLE', message: 'Shared-save linking is not enabled.' },
            403,
          );
        const session = await auth.authorize(sid, request.method === 'POST' ? mutation : undefined);
        if (
          (mode === 'TESTERS' && (session.testerUntil ?? 0) <= Date.now()) ||
          (linkMode === 'TESTERS' && ((session.testerUntil ?? 0) <= Date.now() || !session.linked))
        )
          throw new WebAuthError(403);
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
      if (
        !(error instanceof WebAuthError) &&
        !(error instanceof InvitationError) &&
        !(error instanceof z.ZodError) &&
        internalFailure
      ) {
        const failure = internalFailure(error);
        return path === '/auth/callback'
          ? {
              ...failure,
              cookies: [
                auth.cookie('login', '', 0),
                '__Host-dime-invitation=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
              ],
            }
          : failure;
      }
      if (path === '/auth/callback') {
        try {
          await auth.cancelLogin(
            url.searchParams.get('state') ?? '',
            cookie(request.headers.cookie, '__Host-dime-login'),
          );
        } catch {
          /* TTL bounds cleanup during storage outage. */
        }
        return redirect(auth.origin + '/game/?auth=failed', [
          auth.cookie('login', '', 0),
          '__Host-dime-invitation=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
        ]);
      }
      return result(
        {
          message:
            error instanceof WebAuthError && error.code === 'LINK_CONFLICT'
              ? 'Both identities have existing profiles or a conflicting link. Contact support; no saves were changed.'
              : 'Authentication could not be completed.',
          ...(error instanceof WebAuthError && error.code ? { code: error.code } : {}),
        },
        error instanceof WebAuthError ? error.status : error instanceof InvitationError ? 401 : 503,
      );
    }
  };
}
