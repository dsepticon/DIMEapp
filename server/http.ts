import { GameError } from '../shared/schema';
import { GameService } from './service';
export interface Request {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string;
}
export interface Response {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
export function createApi(
  service: GameService,
  authorize: (header: string | undefined) => Promise<string>,
  origins: string[],
) {
  return async (request: Request): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'X-Content-Type-Options': 'nosniff',
    };
    const origin = request.headers.origin;
    if (origin && !origins.includes(origin))
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ code: 'ORIGIN_DENIED', message: 'Origin not allowed.' }),
      };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    try {
      if (request.method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
      const player = await authorize(request.headers.authorization);
      let result;
      if (request.path === '/state' && request.method === 'GET') result = await service.snapshot(player);
      else if (request.path === '/actions' && request.method === 'POST') {
        if ((request.body?.length ?? 0) > 4096)
          throw new GameError('INVALID_REQUEST', 'Request is too large.', 413);
        let body: unknown;
        try {
          body = JSON.parse(request.body ?? '');
        } catch {
          throw new GameError('INVALID_REQUEST', 'Invalid JSON.');
        }
        result = await service.mutate(player, body);
      } else throw new GameError('NOT_FOUND', 'Endpoint not found.', 404);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    } catch (error) {
      if (error instanceof GameError)
        return {
          statusCode: error.status,
          headers,
          body: JSON.stringify({ code: error.code, message: error.message }),
        };
      // Do not log request bodies, identity, tokens, or raw AWS errors.
      return {
        statusCode: 503,
        headers,
        body: JSON.stringify({
          code: 'UNAVAILABLE',
          message: 'Service unavailable. Retry the same request.',
        }),
      };
    }
  };
}
