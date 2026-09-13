import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, PlayerState, Snapshot } from '../shared/schema';
import { ApiClient, ApiError } from './api';
import { PendingRecord, readPendingRecord, recoveryEvidence, writePendingRecord } from './pendingRecovery';

export type RecoveryStatus = 'idle' | 'recovering' | 'retry' | 'stale' | 'obsolete' | 'unverified';

export function useGame(client: ApiClient | null, identity: string | undefined) {
  const [state, setState] = useState<PlayerState | null>(null);
  const [notice, setNotice] = useState('Connecting to your mining profile…');
  const [storageError, setStorageError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingRecord | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>('idle');
  const [now, setNow] = useState(Date.now());
  const stateRef = useRef(state);
  const pendingRef = useRef(pending);
  const lock = useRef(false);
  const offset = useRef(0);
  const activeIdentity = useRef(identity);
  const activeClient = useRef(client);
  const startup = useRef<{ identity: string; client: ApiClient } | null>(null);
  activeIdentity.current = identity;
  activeClient.current = client;
  const key = identity ? 'dime-pending-v2:' + identity : '';

  const accept = useCallback((snapshot: Snapshot, force = false) => {
    const previous = stateRef.current;
    if (
      force ||
      !previous ||
      (previous.saveGeneration &&
        snapshot.state.saveGeneration &&
        previous.saveGeneration !== snapshot.state.saveGeneration) ||
      snapshot.state.revision >= previous.revision
    ) {
      stateRef.current = snapshot.state;
      setState(snapshot.state);
    }
    offset.current = snapshot.serverTime - Date.now();
    setNow(snapshot.serverTime);
  }, []);

  const savePending = useCallback(
    (record: PendingRecord | null) => {
      if (key) {
        if (record) sessionStorage.setItem(key, writePendingRecord(record));
        else sessionStorage.removeItem(key);
      }
      pendingRef.current = record;
      setPending(record);
    },
    [key],
  );

  const resultNotice = (snapshot: Snapshot, record: PendingRecord) =>
    record.request.action.type === 'firstShift' &&
    record.request.action.step === 'reconcile' &&
    ['CORRECTED', 'LEGACY_SOLD'].includes(snapshot.state.firstShift?.reconciliation ?? '')
      ? 'First Shift updated. Continue your assignment.'
      : snapshot.replayed
        ? 'Previous action confirmed. State synchronized.'
        : 'Operation saved.';

  const markEvidence = useCallback(
    (record: PendingRecord, snapshot: Snapshot) => {
      const evidence = recoveryEvidence(record, snapshot.state);
      accept(snapshot, evidence === 'obsolete');
      if (evidence === 'obsolete') {
        setRecoveryStatus('obsolete');
        setNotice('This pending action belongs to a replaced save. You can discard only this action.');
      } else if (evidence === 'revision-regressed') {
        setRecoveryStatus('stale');
        setNotice('The save revision moved backward. Contact support before retrying.');
      } else if (evidence === 'unverified') {
        setRecoveryStatus('unverified');
        setNotice('This earlier pending action needs your review before it can be retried.');
      }
      return evidence;
    },
    [accept],
  );

  const recover = useCallback(
    async (record: PendingRecord, manual: boolean) => {
      if (!client || lock.current) return;
      const current = () => activeIdentity.current === identity && activeClient.current === client;
      lock.current = true;
      setBusy(true);
      setRecoveryStatus('recovering');
      try {
        const canonical = await client.state();
        if (!current()) return;
        const evidence = markEvidence(record, canonical);
        if (evidence === 'obsolete' || evidence === 'revision-regressed') return;
        if (evidence === 'unverified') {
          if (record.saveGeneration || !manual) return;
          if (
            !window.confirm(
              'The earlier save cannot be verified. Retry this exact pending action on the current save?',
            )
          )
            return;
        }
        const result = await client.mutate(record.request);
        if (!current()) return;
        accept(result);
        try {
          savePending(null);
        } catch {
          setStorageError(true);
          return;
        }
        setRecoveryStatus('idle');
        setNotice(resultNotice(result, record));
      } catch (error) {
        if (!current()) return;
        if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
          try {
            const latest = await client.state();
            if (!current()) return;
            if (markEvidence(record, latest) === 'obsolete') return;
          } catch {
            /* Retain the exact request for later recovery. */
          }
          setRecoveryStatus('stale');
          setNotice('The pending action has a stale save revision. Review it before retrying.');
        } else if (error instanceof ApiError && error.code === 'IDEMPOTENCY_CONFLICT') {
          setRecoveryStatus('stale');
          setNotice('This request ID was used for a different action. Contact support.');
        } else {
          setRecoveryStatus('retry');
          setNotice('The pending action was not confirmed. Retry the same action safely.');
        }
      } finally {
        if (current()) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
    [client, identity, markEvidence, accept, savePending],
  );

  const refresh = useCallback(async () => {
    if (!client || lock.current) return;
    const current = () => activeIdentity.current === identity && activeClient.current === client;
    lock.current = true;
    setBusy(true);
    try {
      const snapshot = await client.state();
      if (!current()) return;
      if (pendingRef.current) {
        if (markEvidence(pendingRef.current, snapshot) === 'safe')
          setNotice('State refreshed. The pending action still needs confirmation.');
      } else {
        accept(snapshot);
        setNotice('State synchronized.');
      }
    } catch {
      if (current()) setNotice('Unable to load state. Retry the connection.');
    } finally {
      if (current()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }, [client, identity, markEvidence, accept]);

  useEffect(() => {
    if (!client || !identity) {
      startup.current = null;
      stateRef.current = null;
      pendingRef.current = null;
      setState(null);
      setPending(null);
      setBusy(false);
      return;
    }
    if (startup.current?.identity !== identity || startup.current.client !== client) {
      startup.current = { identity, client };
      stateRef.current = null;
      pendingRef.current = null;
      lock.current = false;
      setState(null);
      setPending(null);
      setRecoveryStatus('idle');
      setStorageError(false);
      let record: PendingRecord | null = null;
      try {
        const stored = sessionStorage.getItem(key);
        if (stored) {
          record = readPendingRecord(stored);
          pendingRef.current = record;
          setPending(record);
        }
      } catch {
        setStorageError(true);
      }
      if (record) void recover(record, false);
      else void refresh();
    }
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [client, identity, key, recover, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(timer);
  }, []);

  const mutate = useCallback(
    async (action?: Action) => {
      if (!client || lock.current || storageError) return;
      if (!action) {
        if (pendingRef.current) await recover(pendingRef.current, true);
        return;
      }
      if (!stateRef.current || pendingRef.current) {
        if (pendingRef.current) setNotice('Retry the pending action before starting another.');
        return;
      }
      const record: PendingRecord = {
        request: { action, expectedRevision: stateRef.current.revision, requestId: crypto.randomUUID() },
        saveGeneration: stateRef.current.saveGeneration,
      };
      try {
        savePending(record);
      } catch {
        setStorageError(true);
        setNotice('Cannot save retry protection. Transactions are disabled.');
        return;
      }
      const current = () => activeIdentity.current === identity && activeClient.current === client;
      lock.current = true;
      setBusy(true);
      try {
        const result = await client.mutate(record.request);
        if (!current()) return;
        accept(result);
        savePending(null);
        setRecoveryStatus('idle');
        setNotice(resultNotice(result, record));
      } catch (error) {
        if (!current()) return;
        if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
          try {
            const latest = await client.state();
            if (current() && markEvidence(record, latest) === 'obsolete') return;
          } catch {
            /* Retain the exact request. */
          }
          setRecoveryStatus('stale');
          setNotice('The pending action has a stale save revision. Review it before retrying.');
        } else {
          setRecoveryStatus('retry');
          setNotice('The action was not confirmed. Retry the pending action.');
        }
      } finally {
        if (current()) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
    [client, identity, storageError, recover, savePending, accept, markEvidence],
  );

  const discardObsolete = useCallback(async () => {
    const record = pendingRef.current;
    if (!client || !record || lock.current || recoveryStatus !== 'obsolete') return;
    const current = () => activeIdentity.current === identity && activeClient.current === client;
    lock.current = true;
    setBusy(true);
    try {
      const snapshot = await client.state();
      if (!current()) return;
      if (markEvidence(record, snapshot) !== 'obsolete') return;
      savePending(null);
      setRecoveryStatus('idle');
      setNotice('Obsolete pending action discarded. Your current save is ready.');
    } catch {
      if (current()) setNotice('Could not verify the replaced save. Try again.');
    } finally {
      if (current()) {
        lock.current = false;
        setBusy(false);
      }
    }
  }, [client, identity, recoveryStatus, markEvidence, savePending]);

  const cancelPending = useCallback(() => {
    if (!pendingRef.current || lock.current || recoveryStatus === 'obsolete') return;
    if (!window.confirm('Cancel this unconfirmed action? It may already have reached the server.')) return;
    try {
      savePending(null);
      setRecoveryStatus('idle');
      setNotice('Pending action cancelled. Refresh to review the current save.');
    } catch {
      setStorageError(true);
    }
  }, [recoveryStatus, savePending]);

  return {
    state,
    notice: storageError
      ? 'Pending request storage is unavailable or invalid. Transactions are disabled until storage is restored and this view is reloaded.'
      : notice,
    storageError,
    busy,
    pending: pending?.request ?? null,
    recoveryStatus,
    now,
    refresh,
    mutate,
    discardObsolete,
    cancelPending,
  };
}
