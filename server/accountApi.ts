/** M4.2 API composition: every identity uses the same binding-aware transaction store. */
import { WebAuth, WebAuthError } from './webAuth';
import { createWebApi, type WebResponse } from './webHttp';
import { createOriginalApi } from './originalApi';
import { createApi, type Request } from './http';
import { GameService } from './service';
import type { Store } from './store';
import { GameError, type PlayerState } from '../shared/schema';
export function createAccountApi(
  auth: WebAuth,
  extension: {
    authorize: (header: string | undefined) => Promise<string>;
    origins: string[];
    linkingEnabled: boolean;
  },
) {
  const web = createWebApi(auth, extension);
  return async (request: Request): Promise<WebResponse> => {
    const path = request.path.split('?')[0]!,
      origin = request.headers.origin;
    const extensionRoute =
      path.startsWith('/v4/') || ['/state', '/actions', '/profile/reset', '/auth/link/accept'].includes(path);
    if (!extensionRoute) return web(request);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    };
    if (!origin || !extension.origins.includes(origin))
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ message: 'Authentication could not be completed.' }),
      };
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    if (request.method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    try {
      if (path === '/auth/link/accept') {
        const response = await web(request);
        return { ...response, headers: { ...response.headers, ...headers } };
      }
      const extensionPlayer = await extension.authorize(request.headers.authorization),
        bound = await auth.extensionStore(extensionPlayer);
      const legacy: Store<PlayerState> = {
        ...bound.store,
        read: async (player) => {
          const state = await bound.store.read(player);
          if (state?.schemaVersion === 3)
            throw new GameError('CONTENT_UPDATE_REQUIRED', 'Use the current DIME client.', 409);
          return state;
        },
      };
      const api = path.startsWith('/v4/')
        ? createOriginalApi(bound.store, async () => bound.player, extension.origins)
        : createApi(new GameService(legacy), async () => bound.player, extension.origins);
      const response = await api(request);
      if (request.method === 'GET' && path === '/v4/state' && response.statusCode === 200)
        return {
          ...response,
          body: JSON.stringify({ ...JSON.parse(response.body), linkingAvailable: extension.linkingEnabled }),
        };
      return response;
    } catch (error) {
      return {
        statusCode: error instanceof WebAuthError || error instanceof GameError ? error.status : 503,
        headers,
        body: JSON.stringify({ message: 'Authentication could not be completed.' }),
      };
    }
  };
}
