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
    identity: string | undefined;
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
        token = undefined;
        update({ status: 'error', message: 'Twitch authorization is incomplete.' });
        return;
      }
      token = auth.token;
      identity = auth.channelId + ':' + auth.userId;
      update({ status: 'authorized', userId: auth.userId, channelId: auth.channelId });
    });
    extension.onError?.(() => {
      if (!cancelled) {
        token = undefined;
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
      token = undefined;
      clearTimeout(timer);
    },
  };
}
