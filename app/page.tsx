import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';
import { twitchConnection, TwitchSession } from './twitch';
import { clientConfig } from './config';
import { ApiClient } from './api';
import { useGame } from './useGame';
import { RpgPanel } from './RpgPanel';
import { GameView, RpgScreens } from './rpg/ui/Screens';

export default function Home() {
  const config = useMemo(() => {
    try {
      return {
        ...clientConfig({
          dev: import.meta.env.DEV,
          mode: import.meta.env.VITE_DIME_MODE,
          api: import.meta.env.VITE_DIME_API_URL,
          hostname: location.hostname,
        }),
        error: '',
      };
    } catch (error) {
      return {
        local: false,
        api: '',
        error: error instanceof Error ? error.message : 'Invalid configuration.',
      };
    }
  }, []);
  const [session, setSession] = useState<TwitchSession>({ status: 'connecting' });
  const [connection, setConnection] = useState<ReturnType<typeof twitchConnection> | null>(null);
  useEffect(() => {
    if (config.local || config.error) return;
    const active = twitchConnection(setSession);
    setConnection(active);
    return () => active.stop();
  }, [config.local, config.error]);
  const client = useMemo(
    () =>
      config.error || (!config.local && !connection)
        ? null
        : new ApiClient(
            config.api,
            () => connection?.token(),
            (token) => connection?.expired(token),
            config.local,
          ),
    [config, connection],
  );
  const identity = config.local ? 'local' : connection?.identity();
  const {
    state,
    notice,
    resetError,
    storageError,
    busy,
    pending,
    recoveryStatus,
    now,
    refresh,
    mutate,
    discardObsolete,
    cancelPending,
    resetProgress,
  } = useGame(client, identity);
  const [view, setView] = useState<GameView>('game');
  const navigationGuard = useRef({ view, busy });
  navigationGuard.current = { view, busy };
  const navigate = useCallback((next: GameView) => {
    if (navigationGuard.current.view === 'reset' && navigationGuard.current.busy) return;
    setView(next);
  }, []);
  const completeReset = useCallback(
    async (confirmation: string) => {
      const success = await resetProgress(confirmation);
      if (success) setView('game');
      return success;
    },
    [resetProgress],
  );
  useEffect(() => {
    if (storageError) setView('connection');
  }, [storageError]);
  const blocked =
    storageError || busy || !!pending || !state || (!config.local && session.status !== 'authorized');
  const canAct = !blocked && !state?.pending;
  useEffect(() => {
    if (
      canAct &&
      state?.firstShift &&
      (state.firstShift.version === undefined || state.firstShift.version === 1) &&
      !state.firstShift.reconciliation
    )
      void mutate({ type: 'firstShift', step: 'reconcile' });
  }, [canAct, state, mutate]);
  const overlay = view !== 'game' || (!!pending && !busy);
  const status = config.error || session.message || notice;
  return (
    <main className={styles.gameShell}>
      {!state && (
        <section className={styles.connectionScene}>
          <strong>D.I.M.E.</strong>
          <div className={styles.connectionModal} role="dialog" aria-label="Connection status">
            <h1>
              {config.error || storageError ? 'Connection needs attention' : 'Connecting to your profile'}
            </h1>
            <p>{status || 'Sign in through Twitch for your global save across channels.'}</p>
            <button onClick={() => void refresh()} disabled={busy || !identity}>
              Retry connection
            </button>
            {pending && recoveryStatus !== 'obsolete' && (
              <button onClick={() => void mutate()} disabled={busy || !identity}>
                Retry pending action
              </button>
            )}
          </div>
        </section>
      )}
      {state && (
        <>
          <RpgPanel
            key={state.saveGeneration ?? 'legacy-save'}
            state={state}
            canAct={canAct}
            mutate={mutate}
            notice={notice}
            status={config.error || session.message || ''}
            busy={busy}
            overlay={overlay}
            navigate={navigate}
          />
          {overlay && (
            <div className={styles.overlayBackdrop}>
              <section className={styles.gameOverlay} role="dialog" aria-label={`${view} menu`}>
                <div className={styles.overlayHeading}>
                  <strong>
                    {view === 'game'
                      ? 'RECOVER ACTION'
                      : view === 'menu'
                        ? 'D.I.M.E. · PAUSE'
                        : view.toUpperCase()}
                  </strong>
                  <button
                    aria-label="Close menu"
                    disabled={view === 'reset' && busy}
                    onClick={() => navigate('game')}
                  >
                    ✕
                  </button>
                </div>
                {pending && (
                  <section className={styles.status}>
                    <p>
                      {recoveryStatus === 'obsolete'
                        ? 'This action belongs to a replaced save. Your current save is ready after you discard it.'
                        : recoveryStatus === 'recovering'
                          ? 'Checking the pending action with the server…'
                          : 'An action is pending confirmation. Retry safely before starting another.'}
                    </p>
                    {recoveryStatus === 'obsolete' ? (
                      <button disabled={busy} onClick={() => void discardObsolete()}>
                        Discard obsolete pending action
                      </button>
                    ) : (
                      <>
                        <button
                          disabled={busy || (!config.local && session.status !== 'authorized')}
                          onClick={() => void mutate()}
                        >
                          Retry pending action
                        </button>
                        {recoveryStatus !== 'recovering' && (
                          <button disabled={busy} onClick={cancelPending}>
                            Cancel pending action
                          </button>
                        )}
                      </>
                    )}
                  </section>
                )}
                {storageError && (
                  <p className={styles.hint}>Transactions are disabled until retry storage is restored.</p>
                )}
                {view !== 'game' && (
                  <RpgScreens
                    view={view}
                    state={state}
                    canAct={canAct}
                    blocked={blocked}
                    busy={busy}
                    now={now}
                    notice={notice}
                    resetError={resetError}
                    local={config.local}
                    authenticated={session.status === 'authorized'}
                    mutate={mutate}
                    refresh={refresh}
                    resetProgress={completeReset}
                    navigate={navigate}
                  />
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
