/** A guest build has no browser-storage implementation, even on an accidental recovery path. */
const unavailable = () => {
  throw Error('Guest Demo does not create pending actions.');
};
export const pendingStorage = { getItem: unavailable, setItem: unavailable, removeItem: unavailable };
