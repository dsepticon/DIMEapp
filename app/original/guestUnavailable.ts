import type { createGuestRuntime as Factory } from './guestRuntime';
/** Non-guest builds cannot construct a local simulator. */
export const createGuestRuntime: typeof Factory = () => {
  throw Error('Guest runtime is unavailable in this build.');
};
