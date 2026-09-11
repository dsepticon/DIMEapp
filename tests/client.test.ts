import { expect, it, vi } from 'vitest';
import { ApiClient } from '../app/api';
import { initialState } from '../shared/game';
it('uses the current token on every API call', async () => {
  let token = 'synthetic-one';
  const fetcher = vi
    .fn()
    .mockImplementation(async () => new Response(JSON.stringify({ state: initialState(), serverTime: 1 })));
  const api = new ApiClient(
    'https://example.test',
    () => token,
    () => {},
    false,
    fetcher,
  );
  await api.state();
  token = 'synthetic-two';
  await api.state();
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-one');
  expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer synthetic-two');
});
it('rejects requests until authorized and handles 401 without local fallback', async () => {
  const fetcher = vi.fn(),
    expired = vi.fn();
  const api = new ApiClient('', () => undefined, expired, false, fetcher);
  await expect(api.state()).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
  const signed = new ApiClient(
    '',
    () => 'synthetic',
    expired,
    false,
    async () => new Response('{}', { status: 401 }),
  );
  await expect(signed.state()).rejects.toMatchObject({ status: 401 });
  expect(expired).toHaveBeenCalledWith('synthetic');
});
it('preserves ambiguous network errors for same-request retries', async () => {
  const api = new ApiClient(
    '',
    () => undefined,
    () => {},
    true,
    async () => {
      throw new Error('network');
    },
  );
  await expect(api.state()).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
});
it('rejects invalid server state and sanitizes non-JSON errors', async () => {
  await expect(
    new ApiClient(
      '',
      () => undefined,
      () => {},
      true,
      async () => new Response('{}'),
    ).state(),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(
    new ApiClient(
      '',
      () => undefined,
      () => {},
      true,
      async () => new Response('<html>error</html>', { status: 503 }),
    ).state(),
  ).rejects.toMatchObject({ status: 503 });
});
