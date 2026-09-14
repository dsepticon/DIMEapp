import { Mutation, ResetRequest, Snapshot, snapshotSchema } from '../shared/schema';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export class ApiClient {
  constructor(
    private base: string,
    private token: () => string | undefined,
    private expired: (token: string | undefined) => void,
    private local = false,
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  private async request(path: string, mutation?: Mutation | ResetRequest): Promise<Snapshot> {
    const token = this.token();
    if (!this.local && !token) throw new ApiError(401, 'UNAUTHORIZED', 'Waiting for Twitch authorization.');
    let response: Response;
    try {
      response = await this.fetcher(this.base + path, {
        method: mutation ? 'POST' : 'GET',
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(mutation ? { 'Content-Type': 'application/json' } : {}),
        },
        body: mutation ? JSON.stringify(mutation) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(
        0,
        'NETWORK',
        'Connection interrupted. Retry the pending action; it will not run twice.',
      );
    }
    if (response.status === 401) this.expired(token);
    if (!response.ok) {
      let code = 'UNAVAILABLE',
        message = 'Request failed. Retry the pending action.';
      try {
        const data: unknown = await response.json();
        if (data && typeof data === 'object' && 'code' in data && typeof data.code === 'string')
          code = data.code;
        if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string')
          message = data.message.slice(0, 200);
      } catch {
        /* A gateway error need not be JSON. */
      }
      throw new ApiError(response.status, code, message);
    }
    try {
      return snapshotSchema.parse(await response.json());
    } catch {
      throw new ApiError(0, 'INVALID_RESPONSE', 'Invalid response. Retry to reconcile state.');
    }
  }
  state() {
    return this.request('/state');
  }
  mutate(request: Mutation) {
    return this.request('/actions', request);
  }
  reset(request: ResetRequest) {
    return this.request('/profile/reset', request);
  }
}
