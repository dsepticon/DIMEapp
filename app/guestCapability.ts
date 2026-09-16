/** Guest admission is a public edge capability, never an authentication credential. */
export async function guestCapability() {
  try {
    const response = await fetch('/auth/status', { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) return false;
    const value = await response.json();
    return (
      value?.guestDemoAvailable === true &&
      value?.guestStorage === 'memory' &&
      value?.signInAvailable === false &&
      value?.linkingAvailable === false
    );
  } catch {
    return false;
  }
}
