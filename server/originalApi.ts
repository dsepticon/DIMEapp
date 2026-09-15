import { GameError } from '../shared/schema';
import { originalStateSchema } from '../shared/originalSchema';
import { ContentConversionService, type VersionedContentState } from './contentConversion';
import { OriginalMiningService } from './originalMiningService';
import { OriginalResetService } from './originalReset';
import type { Request, Response } from './http';
import type { Store } from './store';
import { originalSpatial } from '../shared/originalSpatial';
import { OriginalActionService } from './originalActionService';
import { randomUUID } from 'node:crypto';
import { originalInitialState } from '../shared/originalGame';
import { disabledConversionGate, type ConversionGate } from './conversionGate';

/** Proposed v4 surface. It is deliberately not connected to handler.ts before coordinated cutover review. */
export function createOriginalApi(
  store: Store<VersionedContentState>,
  authorize: (header: string | undefined) => Promise<string>,
  origins: string[],
  clock: () => number = Date.now,
  conversionGate: ConversionGate = disabledConversionGate,
) {
  const conversion = new ContentConversionService(store, clock);
  // Both services share the store, but only accept strict schema-v3 states at runtime.
  const mining = new OriginalMiningService(
    store as Store<ReturnType<typeof originalStateSchema.parse>>,
    originalSpatial,
    clock,
  );
  const reset = new OriginalResetService(store as Store<ReturnType<typeof originalStateSchema.parse>>, clock);
  const actions = new OriginalActionService(
    store as Store<ReturnType<typeof originalStateSchema.parse>>,
    clock,
  );
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
      if ((request.body?.length ?? 0) > 16_384)
        throw new GameError('INVALID_REQUEST', 'Request is too large.', 413);
      let body: unknown;
      if (request.method === 'POST') {
        try {
          body = JSON.parse(request.body ?? '');
        } catch {
          throw new GameError('INVALID_REQUEST', 'Invalid JSON.');
        }
      }
      let result: unknown;
      if (request.method === 'GET' && request.path === '/v4/state') {
        const state = await store.read(player);
        let canonical = state;
        if (!canonical) {
          const fresh = originalInitialState(randomUUID());
          const created = await store.commit(player, null, fresh);
          canonical = created ? fresh : await store.read(player);
        }
        if (!canonical) throw new GameError('UNAVAILABLE', 'State is temporarily unavailable.', 503);
        result =
          canonical.schemaVersion === 3
            ? { state: originalStateSchema.parse(canonical), serverTime: clock() }
            : {
                conversionRequired: true,
                conversionAvailable: conversionGate.permits(player),
                revision: canonical.revision,
                saveGeneration: canonical.saveGeneration,
                serverTime: clock(),
              };
      } else if (request.method === 'POST' && request.path === '/v4/content/preview')
        result = { state: await conversion.preview(player, body), serverTime: clock() };
      else if (request.method === 'POST' && request.path === '/v4/content/convert')
        if (!conversionGate.permits(player))
          throw new GameError('CONVERSION_NOT_ENABLED', 'Save conversion is not available.', 409);
        else result = { ...(await conversion.apply(player, body)), serverTime: clock() };
      else if (request.method === 'POST' && request.path === '/v4/actions') {
        const actionType = (body as { action?: { type?: string } })?.action?.type;
        result = {
          ...(actionType?.includes('Laser') || actionType?.includes('Vacuum')
            ? await mining.mutate(player, body)
            : await actions.mutate(player, body)),
          serverTime: clock(),
        };
      } else if (request.method === 'POST' && request.path === '/v4/profile/reset')
        result = { ...(await reset.reset(player, body)), serverTime: clock() };
      else throw new GameError('NOT_FOUND', 'Endpoint not found.', 404);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    } catch (error) {
      if (error instanceof GameError)
        return {
          statusCode: error.status,
          headers,
          body: JSON.stringify({ code: error.code, message: error.message }),
        };
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
