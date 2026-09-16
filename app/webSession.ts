/** Cookie authentication: OAuth credentials never enter JavaScript or browser storage. */
export async function webSession() {
  const response = await fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw Error('Sign in with Twitch to continue.');
  const value = (await response.json()) as {
    identity?: unknown;
    csrf?: unknown;
    linkingAvailable?: unknown;
    profileExists?: unknown;
  };
  if (typeof value.identity !== 'string' || typeof value.csrf !== 'string')
    throw Error('Sign in with Twitch to continue.');
  return {
    identity: value.identity,
    csrf: value.csrf,
    linkingAvailable: value.linkingAvailable === true,
    profileExists: value.profileExists !== false,
  };
}

/** No inferred availability on errors or malformed capability responses. */
export async function webCapabilities() {
  try {
    const response = await fetch('/auth/status', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw Error('Unavailable');
    const value = (await response.json()) as { signInAvailable?: unknown; linkingAvailable?: unknown };
    return {
      signInAvailable: value.signInAvailable === true,
      linkingAvailable: value.signInAvailable === true && value.linkingAvailable === true,
    };
  } catch {
    return { signInAvailable: false, linkingAvailable: false };
  }
}
