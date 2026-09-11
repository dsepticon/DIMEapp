import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, Mutation, PlayerState, Snapshot, mutationSchema } from '../shared/schema';
import { ApiClient, ApiError } from './api';
export function useGame(client: ApiClient | null, identity: string | undefined) {
  const [state, setState] = useState<PlayerState | null>(null);
  const [notice, setNotice] = useState('Connecting to your mining profile…');
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Mutation | null>(null);
  const [now, setNow] = useState(Date.now());
  const ref = useRef(state),
    pendingRef = useRef(pending),
    lock = useRef(false),
    generation = useRef(0),
    offset = useRef(0);
  const key = identity ? 'dime-pending-v2:' + identity : '';
  const accept = useCallback((snapshot: Snapshot) => {
    if (!ref.current || snapshot.state.revision >= ref.current.revision) {
      ref.current = snapshot.state;
      setState(snapshot.state);
    }
    offset.current = snapshot.serverTime - Date.now();
    setNow(snapshot.serverTime);
  }, []);
  const savePending = useCallback(
    (value: Mutation | null) => {
      if (key) {
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
      }
      pendingRef.current = value;
      setPending(value);
    },
    [key],
  );
  const refresh = useCallback(async () => {
    if (!client || lock.current) return;
    const current = generation.current;
    lock.current = true;
    setBusy(true);
    try {
      const snapshot = await client.state();
      if (current === generation.current) {
        accept(snapshot);
        setNotice('State synchronized.');
      }
    } catch (error) {
      if (current === generation.current)
        setNotice(error instanceof Error ? error.message : 'Unable to load state.');
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }, [client, accept]);
  useEffect(() => {
    const activeGeneration = ++generation.current;
    setStorageError(false);
    ref.current = null;
    setState(null);
    pendingRef.current = null;
    setPending(null);
    lock.current = false;
    if (!client || !identity) {
      setBusy(false);
      return;
    }
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) {
        const request = mutationSchema.parse(JSON.parse(saved));
        pendingRef.current = request;
        setPending(request);
      }
    } catch {
      setStorageError(true);
    }
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener('focus', focus);
    return () => {
      generation.current = activeGeneration + 1;
      window.removeEventListener('focus', focus);
    };
  }, [client, identity, key, refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(timer);
  }, []);
  const mutate = useCallback(
    async (action?: Action) => {
      if (!client || !ref.current || lock.current || storageError) return;
      if (action && pendingRef.current) {
        setNotice('Retry the pending action before starting another.');
        return;
      }
      const current = generation.current;
      const request =
        pendingRef.current ??
        (action ? { action, expectedRevision: ref.current.revision, requestId: crypto.randomUUID() } : null);
      if (!request) return;
      // Persist the intent before sending it; no credentials or balances enter storage.
      try {
        savePending(request);
      } catch {
        setNotice('Cannot save retry protection. Enable session storage before making a transaction.');
        return;
      }
      lock.current = true;
      setBusy(true);
      try {
        const snapshot = await client.mutate(request);
        if (current !== generation.current) return;
        accept(snapshot);
        savePending(null);
        setNotice(snapshot.replayed ? 'Previous action confirmed. State synchronized.' : 'Operation saved.');
      } catch (error) {
        if (current !== generation.current) return;
        setNotice(error instanceof Error ? error.message : 'Unable to complete action.');
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 401 &&
          error.status !== 429
        ) {
          try {
            savePending(null);
          } catch {
            setStorageError(true);
            return;
          }
          try {
            const snapshot = await client.state();
            if (current === generation.current) accept(snapshot);
          } catch {
            /* Retain the explicit error, never overwrite with speculative state. */
          }
        }
      } finally {
        if (current === generation.current) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
    [client, savePending, accept, storageError],
  );
  return {
    state,
    notice: storageError
      ? 'Pending request storage is unavailable or invalid. Transactions are disabled until storage is restored and this view is reloaded.'
      : notice,
    storageError,
    busy,
    pending,
    now,
    refresh,
    mutate,
  };
}
