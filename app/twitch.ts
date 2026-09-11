export interface TwitchSession { status: 'connecting' | 'authorized' | 'development'; userId?: string; channelId?: string; token?: string }
type TwitchAuth = { userId?: string; channelId: string; token: string }
type TwitchExtension = { onAuthorized(callback: (auth: TwitchAuth) => void): void; onError?(callback: (error: unknown) => void): void }
declare global { interface Window { Twitch?: { ext?: TwitchExtension } } }

export function connectToTwitch(update: (session: TwitchSession) => void) {
  let cancelled = false
  let attempts = 0
  const connect = () => {
    if (cancelled) return
    const extension = window.Twitch?.ext
    if (extension) {
      extension.onAuthorized(auth => { if (!cancelled) update({ status: 'authorized', userId: auth.userId, channelId: auth.channelId, token: auth.token }) })
      extension.onError?.(() => { if (!cancelled) update({ status: 'development' }) })
      return
    }
    if (++attempts < 20) window.setTimeout(connect, 100)
    else update({ status: 'development' })
  }
  connect()
  return () => { cancelled = true }
}
