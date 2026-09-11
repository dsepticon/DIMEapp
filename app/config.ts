export function clientConfig(input: { dev: boolean; mode?: string; api?: string; hostname: string }) {
  const local = input.mode === 'local';
  if (local && (!input.dev || !['localhost', '127.0.0.1'].includes(input.hostname)))
    throw new Error('Local mode is restricted to development on loopback.');
  if (input.mode && !['local', 'twitch'].includes(input.mode)) throw new Error('Unknown DIME mode.');
  const api = input.api || (local ? 'http://127.0.0.1:8787' : '');
  if (!api) throw new Error('Backend URL is not configured. Set VITE_DIME_API_URL for this environment.');
  const url = new URL(api);
  if (url.username || url.password || url.search || url.hash) throw new Error('Invalid backend URL.');
  if (
    local
      ? !['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'http:'
      : url.protocol !== 'https:'
  )
    throw new Error('Invalid backend protocol or host.');
  return { local, api: api.replace(/\/$/, '') };
}
