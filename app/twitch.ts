export interface TwitchSession {
  status: 'connecting' | 'authorized' | 'error';
  userId?: string;
  channelId?: string;
  message?: string;
}
type Authorization = { userId: string; channelId: string; token: string };
export interface TwitchExtension {
  onAuthorized(callback: (auth: Authorization) => void): void;
  onError?(callback: () => void): void;
}
declare global {
  interface Window {
    Twitch?: { ext?: TwitchExtension };
  }
}
export function twitchConnection(
  update: (session: TwitchSession) => void,
  getExtension: () => TwitchExtension | undefined = () => window.Twitch?.ext,
) {
  let cancelled = false,
    token: string | undefined,
    identity: string | undefined,
    currentOpaqueId: string | undefined;
  let authorizationVersion = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (cancelled) return;
    const extension = getExtension();
    if (!extension) {
      timer = setTimeout(connect, 100);
      return;
    }
    extension.onAuthorized((auth) => {
      if (cancelled) return;
      if (!auth.token || !auth.userId || !auth.channelId) {
        authorizationVersion++;
        token = undefined;
        identity = undefined;
        currentOpaqueId = undefined;
        update({ status: 'error', message: 'Twitch authorization is incomplete.' });
        return;
      }
      if (!/^U[-A-Za-z0-9]+$/.test(auth.userId)) {
        authorizationVersion++;
        token = undefined;
        identity = undefined;
        currentOpaqueId = undefined;
        update({ status: 'error', message: 'Sign in to Twitch to use a permanent DIME save.' });
        return;
      }
      const version = ++authorizationVersion;
      if (currentOpaqueId !== auth.userId) {
        identity = undefined;
        currentOpaqueId = auth.userId;
        update({ status: 'connecting', message: 'Verifying Twitch identity.' });
      }
      token = auth.token;
      // The browser only needs a stable, non-secret session-storage namespace.
      void crypto.subtle
        .digest('SHA-256', new TextEncoder().encode(auth.userId))
        .then((digest) => {
          if (cancelled || version !== authorizationVersion) return;
          identity = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
            '',
          );
          update({ status: 'authorized' });
        })
        .catch(() => {
          if (!cancelled && version === authorizationVersion) {
            token = undefined;
            update({ status: 'error', message: 'Could not prepare Twitch identity.' });
          }
        });
    });
    extension.onError?.(() => {
      if (!cancelled) {
        authorizationVersion++;
        token = undefined;
        identity = undefined;
        currentOpaqueId = undefined;
        update({ status: 'error', message: 'Twitch connection failed. Reopen the extension to retry.' });
      }
    });
  };
  connect();
  return {
    token: () => token,
    identity: () => identity,
    expired: (used: string | undefined) => {
      if (token === used) {
        token = undefined;
        update({ status: 'connecting', message: 'Waiting for Twitch to refresh authorization.' });
      }
    },
    stop: () => {
      cancelled = true;
      authorizationVersion++;
      token = undefined;
      currentOpaqueId = undefined;
      clearTimeout(timer);
    },
  };
}
