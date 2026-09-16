import { ScannerHUD, type ScannerPulse } from './ScannerHUD';
import { originalZoneMap } from '../../shared/originalWorld';
import { nearInteraction } from '../../shared/originalNavigation';
import { emitGameAudio } from './audioEvents';
import { useEffect, useRef, useState } from 'react';
import { twitchConnection, type TwitchSession } from '../twitch';
import { type OriginalPlayerState } from '../../shared/originalSchema';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import { formatCscuMinor } from '../../shared/mineralUnits';
import './original.css';
import { MiningConsole, type LaserVisual } from './MiningConsole';
import { WalkingWorld } from './WalkingWorld';
import type { Position } from './walking';
import {
  classifyOriginalRecovery,
  readOriginalPending,
  recoverySnapshot,
  recoveryMessage,
  OriginalApiError,
} from './recovery';
import { PhysicalNavigation } from './PhysicalNavigation';
import { VacuumConsole, type VacuumVisual, type ToolMode } from './VacuumConsole';
import { nodeInZone } from '../../shared/originalVacuum';
import { ServiceConsole } from './ServiceConsole';
import { webSession, webCapabilities } from '../webSession';
import { AccountLink } from '../AccountLink';

type Gateway = {
  token(): string | undefined;
  identity(): string | undefined;
  expired(token: string | undefined): void;
  stop(): void;
  csrf?(): string;
};
const uuid = () => crypto.randomUUID();
function App({ webReview = false }: { webReview?: boolean }) {
  const configuredApi = import.meta.env.VITE_DIME_API_URL as string | undefined;
  const mode = import.meta.env.DEV && webReview ? 'web' : import.meta.env.VITE_DIME_MODE || 'web';
  const api =
    mode === 'web'
      ? '/api'
      : (configuredApi || (mode === 'local' ? 'http://127.0.0.1:8787' : '')).replace(/\/$/, '');
  const [session, setSession] = useState<TwitchSession>({ status: 'connecting' });
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [state, setState] = useState<OriginalPlayerState | null>(null);
  const [conversion, setConversion] = useState<{
    revision: number;
    saveGeneration: string;
    available: boolean;
    requestId?: string;
  } | null>(null);
  const [message, setMessage] = useState('Connecting to Destroya Industries operations…');
  const [busy, setBusy] = useState(false);
  const [canLink, setCanLink] = useState(false);
  const [canSignIn, setCanSignIn] = useState(false);
  const [profileChoice, setProfileChoice] = useState(false);
  const requestEpoch = useRef(0);
  const playerPosition = useRef<Position>({ x: 0, y: 0 });
  const [playerTile, setPlayerTile] = useState({ x: 0, y: 0 });
  const [mapOpen, setMapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [touchHidden, setTouchHidden] = useState(false);
  const [controlsIdle, setControlsIdle] = useState(false);
  useEffect(() => {
    let last = performance.now();
    const pointers = new Set<number>();
    const wake = (event?: Event) => {
      if (event instanceof PointerEvent) {
        if (event.type === 'pointerdown') pointers.add(event.pointerId);
        if (event.type === 'pointerup' || event.type === 'pointercancel') pointers.delete(event.pointerId);
      }
      last = performance.now();
      setControlsIdle(false);
    };
    let gamepadAllowed = true;
    const tick = window.setInterval(() => {
      if (gamepadAllowed) {
        try {
          if (
            navigator
              .getGamepads?.()
              .some(
                (pad) =>
                  pad &&
                  (pad.buttons.some((button) => button.pressed) ||
                    pad.axes.some((axis) => Math.abs(axis) > 0.2)),
              )
          )
            wake();
        } catch {
          // Embedding policies may deny gamepads; other input and idle handling still work.
          gamepadAllowed = false;
        }
      }
      setControlsIdle(pointers.size === 0 && performance.now() - last > 4500);
    }, 50);
    const events = [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'keydown',
      'keyup',
      'touchstart',
    ] as const;
    const releasePointers = () => {
      pointers.clear();
      wake();
    };
    window.addEventListener('blur', releasePointers);
    document.addEventListener('visibilitychange', releasePointers);
    events.forEach((name) => window.addEventListener(name, wake, { passive: true }));
    return () => {
      clearInterval(tick);
      window.removeEventListener('blur', releasePointers);
      document.removeEventListener('visibilitychange', releasePointers);
      events.forEach((name) => window.removeEventListener(name, wake));
    };
  }, []);
  const [objective, setObjective] = useState('');
  const [marker, setMarker] = useState<{ x: number; y: number } | undefined>();
  const [toolMode, setToolMode] = useState<ToolMode>('laser');
  const [laserVisual, setLaserVisual] = useState<LaserVisual | null>(null);
  const [vacuumVisual, setVacuumVisual] = useState<VacuumVisual | null>(null);
  const [fragmentTarget, setFragmentTarget] = useState<{ nodeId: string; pieceId: string } | null>(null);
  const hasFragments =
    !!state &&
    Object.values(state.world.nodes).some(
      (n) => nodeInZone(state, n) && n.status === 'FRACTURED' && n.fragments.some((p) => !p.collected),
    );
  useEffect(() => {
    if (hasFragments) setToolMode('extraction');
  }, [hasFragments, state?.world.zone, state?.saveGeneration]);
  const [targetNode, setTargetNode] = useState('');
  const [scannerPulse, setScannerPulse] = useState<ScannerPulse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const overlayOpen = menuOpen || mapOpen || resetOpen;
  useEffect(() => {
    if (!overlayOpen) return;
    window.dispatchEvent(new Event('blur'));
    const previous = document.activeElement as HTMLElement | null;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setMapOpen(false);
        setResetOpen(false);
      }
      if (event.key === 'Tab') {
        const sheet =
          document.querySelector('.modal') ??
          document.querySelector('.destinationMap') ??
          document.querySelector('.gameSheet');
        const controls = Array.from(
          sheet?.querySelectorAll<HTMLElement>('button:not(:disabled), a, input, select') ?? [],
        ).filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', close);
    const focus = requestAnimationFrame(() =>
      (
        document.querySelector<HTMLElement>('.modal button') ??
        document.querySelector<HTMLElement>('.destinationMap button') ??
        document.querySelector<HTMLElement>('.gameSheet button')
      )?.focus(),
    );
    return () => {
      cancelAnimationFrame(focus);
      document.removeEventListener('keydown', close);
      previous?.focus();
    };
  }, [overlayOpen, menuOpen, mapOpen, resetOpen]);
  const pendingKey = () => {
    const identity = gateway?.identity();
    return identity ? `dime-pending-v2:${identity}` : '';
  };
  useEffect(() => {
    if (mode === 'web') {
      let active = true;
      void webCapabilities().then(async (capabilities) => {
        if (!active) return;
        setCanSignIn(capabilities.signInAvailable);
        if (!capabilities.signInAvailable) {
          setCanLink(false);
          setMessage('Web sign-in is not available yet');
          return;
        }
        await webSession()
          .then((value) => {
            if (!active) return;
            setGateway({
              token: () => undefined,
              identity: () => value.identity,
              csrf: () => value.csrf,
              expired: () => {
                requestEpoch.current += 1;
                setState(null);
                setGateway(null);
                setMessage('Sign in with Twitch to continue.');
              },
              stop: () => {},
            });
            setCanLink(capabilities.linkingAvailable && value.linkingAvailable);
            setProfileChoice(!value.profileExists);
            setSession({ status: 'authorized' });
          })
          .catch(() => {
            if (active) setMessage('Sign in with Twitch to continue.');
          });
      });
      return () => {
        active = false;
      };
    }
    if (mode === 'local') {
      setGateway({
        token: () => undefined,
        identity: () => 'local-original-review',
        expired: () => {},
        stop: () => {},
      });
      setSession({ status: 'authorized' });
      return;
    }
    if (mode !== 'twitch') return;
    const connection = twitchConnection(setSession);
    setGateway(connection);
    return () => connection.stop();
  }, [mode]);
  const lock = useRef(false);
  const snapshotRef = useRef<ReturnType<typeof recoverySnapshot> | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardPhrase, setDiscardPhrase] = useState('');
  const request = async (path: string, body?: unknown) => {
    if (!api) throw Error('Backend unavailable.');
    const identity = gateway?.identity();
    const epoch = requestEpoch.current;
    const token = gateway?.token(),
      controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(api + path, {
        method: body ? 'POST' : 'GET',
        signal: controller.signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(mode === 'web' && body ? { 'X-Dime-CSRF': gateway?.csrf?.() ?? '' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: mode === 'web' ? 'same-origin' : 'omit',
      });
      if (response.status === 401) gateway?.expired(token);
      const value = await response.json();
      if (epoch !== requestEpoch.current || identity !== gateway?.identity())
        throw new OriginalApiError('IDENTITY_CHANGED', 409);
      if (!response.ok)
        throw new OriginalApiError(
          typeof value.code === 'string' ? value.code : 'UNKNOWN_RESPONSE',
          response.status,
        );
      return value as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  };
  const adopt = (value: Record<string, unknown>) => {
    if (mode !== 'web') setCanLink(value.linkingAvailable === true);
    const snapshot = recoverySnapshot(value);
    snapshotRef.current = snapshot;
    setState(snapshot.state ?? null);
    if (snapshot.legacy)
      setConversion((old) => ({
        revision: snapshot.revision,
        saveGeneration: snapshot.generation,
        available: value.conversionAvailable === true,
        ...(old?.revision === snapshot.revision && old.saveGeneration === snapshot.generation
          ? { requestId: old.requestId }
          : {}),
      }));
    else setConversion(null);
    return snapshot;
  };
  const clearPending = (key: string, raw: string) => {
    if (sessionStorage.getItem(key) !== raw) return false;
    sessionStorage.removeItem(key);
    setPendingBlocked(false);
    setDiscardOpen(false);
    setDiscardPhrase('');
    return true;
  };
  const uncertain = () => {
    setPendingBlocked(true);
    setMessage(
      'Previous action is unconfirmed. Walking and inspection remain available. Retry to check its result.',
    );
  };
  const recover = async (value: Record<string, unknown>, key: string, raw: string) => {
    const snapshot = adopt(value),
      record = readOriginalPending(raw);
    const decision = classifyOriginalRecovery(record, snapshot);
    if (decision === 'obsolete') {
      clearPending(key, raw);
      setMessage('An obsolete action was removed. Your current save is ready.');
      return;
    }
    if (decision !== 'replay' || !record) {
      uncertain();
      return;
    }
    try {
      const result = await request(record.path, record.request);
      const canonical = recoverySnapshot(result);
      if (classifyOriginalRecovery(record, canonical, { success: true }) === 'confirmed') {
        adopt(result);
        clearPending(key, raw);
        setMessage('Previous action confirmed.');
      }
    } catch (error) {
      if (classifyOriginalRecovery(record, snapshot, { error }) === 'rejected') {
        try {
          adopt(await request('/v4/state'));
          clearPending(key, raw);
          setMessage(recoveryMessage(error));
        } catch {
          uncertain();
        }
      } else uncertain();
    }
  };
  const refresh = async () => {
    if (!gateway?.identity() || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const key = pendingKey(),
        value = await request('/v4/state'),
        raw = sessionStorage.getItem(key);
      if (raw) await recover(value, key, raw);
      else {
        adopt(value);
        setPendingBlocked(false);
        setMessage(
          value.conversionRequired
            ? 'Preview the equivalent content update before applying it.'
            : 'Operation synchronized.',
        );
      }
    } catch {
      setMessage('Connection unavailable. Retry to synchronize.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    if (mode !== 'local' && session.status !== 'authorized') {
      setState(null);
      snapshotRef.current = null;
      return;
    }
    if (!profileChoice) void refresh();
    // Authentication changes are the synchronization boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, session.status, profileChoice]);
  const execute = async (
    path: string,
    body: Record<string, unknown>,
  ): Promise<OriginalPlayerState | null> => {
    if (lock.current || pendingBlocked || !snapshotRef.current) return null;
    const key = pendingKey();
    if (!key) return null;
    if (sessionStorage.getItem(key)) {
      uncertain();
      return null;
    }
    lock.current = true;
    setBusy(true);
    const raw = JSON.stringify({ version: 4, contentVersion: 4, saveFormatVersion: 3, path, request: body });
    const record = readOriginalPending(raw),
      snapshot = snapshotRef.current;
    let stored = false;
    try {
      sessionStorage.setItem(key, raw);
      stored = true;
      const result = await request(path, body),
        next = recoverySnapshot(result);
      if (classifyOriginalRecovery(record, next, { success: true }) !== 'confirmed')
        throw Error('Unknown outcome');
      adopt(result);
      clearPending(key, raw);
      setMessage('Action confirmed.');
      return next.state ?? null;
    } catch (error) {
      if (!stored) setMessage('Browser storage is unavailable. No action was sent.');
      else if (classifyOriginalRecovery(record, snapshot, { error }) === 'rejected') {
        try {
          adopt(await request('/v4/state'));
          clearPending(key, raw);
          setMessage(recoveryMessage(error));
        } catch {
          uncertain();
        }
      } else uncertain();
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const bodyFor = (extra: Record<string, unknown>) => ({
    requestId: uuid(),
    expectedRevision: snapshotRef.current!.revision,
    expectedGeneration: snapshotRef.current!.generation,
    ...extra,
  });
  const mutate = async (action: Record<string, unknown>) => {
    const result = snapshotRef.current?.state ? await execute('/v4/actions', bodyFor({ action })) : null;
    if (result)
      emitGameAudio(
        action.type === 'finishExtraction'
          ? 'collection'
          : action.type === 'startExtraction'
            ? 'vacuum'
            : 'terminal',
      );
    return result;
  };
  const convert = async () => {
    if (!conversion?.requestId) return;
    await execute('/v4/content/convert', {
      requestId: conversion.requestId,
      expectedRevision: conversion.revision,
      expectedGeneration: conversion.saveGeneration,
    });
  };
  const previewConversion = async () => {
    if (!conversion || lock.current || pendingBlocked) return;
    lock.current = true;
    setBusy(true);
    const requestId = uuid(),
      body = {
        requestId,
        expectedRevision: conversion.revision,
        expectedGeneration: conversion.saveGeneration,
      };
    try {
      await request('/v4/content/preview', body);
      setConversion({ ...conversion, requestId });
      setMessage('Equivalent values, holdings and progress previewed.');
    } catch (error) {
      const decision = classifyOriginalRecovery(
        {
          version: 4,
          path: '/v4/content/convert',
          request: body,
          generation: conversion.saveGeneration,
          legacy: false,
        },
        snapshotRef.current!,
        { error },
      );
      if (decision === 'rejected') {
        try {
          adopt(await request('/v4/state'));
          setMessage(recoveryMessage(error));
        } catch {
          setMessage('Preview unavailable. Retry when connected.');
        }
      } else setMessage('Preview unavailable. Retry when connected.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!state || resetPhrase !== 'RESET MY DIME PROFILE') return;
    const next = await execute('/v4/profile/reset', bodyFor({ confirmation: resetPhrase }));
    if (next) {
      setResetOpen(false);
      setResetPhrase('');
      setMessage('Game progress reset.');
    }
  };
  const discard = async () => {
    if (discardPhrase !== 'DISCARD' || lock.current) return;
    const key = pendingKey(),
      raw = sessionStorage.getItem(key);
    if (!raw) return;
    lock.current = true;
    setBusy(true);
    try {
      adopt(await request('/v4/state'));
      clearPending(key, raw);
      setMessage('Pending retry discarded. Review the current save before repeating the action.');
    } catch {
      setMessage('Connect to refresh your save before discarding.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const recoveryControls = pendingBlocked && (
    <section className="recoveryControls" aria-label="Pending action recovery">
      <button disabled={busy} onClick={() => void refresh()}>
        Retry pending action
      </button>
      <button disabled={busy} onClick={() => setDiscardOpen(true)}>
        Review discard
      </button>
      {discardOpen && (
        <div>
          <p>
            Its outcome may be unknown. Discard stops retries; it does not undo an accepted action. Review
            your save before repeating it. Type DISCARD to confirm.
          </p>
          <input
            aria-label="Discard confirmation"
            value={discardPhrase}
            onChange={(event) => setDiscardPhrase(event.target.value)}
          />
          <button disabled={busy || discardPhrase !== 'DISCARD'} onClick={() => void discard()}>
            Confirm discard
          </button>
          <button
            onClick={() => {
              setDiscardOpen(false);
              setDiscardPhrase('');
            }}
          >
            Keep pending action
          </button>
        </div>
      )}
    </section>
  );
  const location = ORIGINAL_CONTENT.locations.find((x) => x.id === state?.location);
  const zoneInfo = ORIGINAL_CONTENT.zones.find((x) => x.id === state?.world.zone);
  const zoneKinds = zoneInfo?.objectKinds ?? [];
  const identityHeader = (
    <header>
      <div>
        <strong>D.I.M.E.</strong>
        <small>DESTROYA INDUSTRIES MINING EXPERIENCE</small>
      </div>
      <span>{location?.name ?? 'Secure connection'}</span>
      {mode === 'web' && gateway && (
        <button
          onClick={() =>
            void fetch('/auth/logout', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', 'X-Dime-CSRF': gateway.csrf?.() ?? '' },
              body: '{}',
            })
              .then((response) => {
                if (!response.ok) throw Error();
                gateway.expired(undefined);
              })
              .catch(() => setMessage('Sign out could not be confirmed. Retry.'))
          }
        >
          Sign out
        </button>
      )}
    </header>
  );
  const legalFooter = (
    <footer>
      <b>Destroya Industries</b>
      <span>Cairncoil Reach · Lomrek system</span>
      <span>Founded by Dorathaadestroya · Founder and Operations Director</span>
      <small>{ORIGINAL_CONTENT.materialDisclaimer}</small>
      <a
        href="https://destroyaindustriesminingextension.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
      >
        Privacy Policy
      </a>
      <small>
        DIME is an original industrial exploration game operated by Dsepticon. No creator likeness, voice,
        biography, or attributed dialogue is used.
      </small>
    </footer>
  );
  return (
    <main
      className={`originalApp${mode === 'web' ? ' standalone' : ''}`}
      data-tool-mode={toolMode}
      data-playing={!!state}
      data-menu={menuOpen}
      data-idle={controlsIdle && !overlayOpen && !busy && !laserVisual?.held && !vacuumVisual}
      data-touch-hidden={touchHidden}
    >
      {!state && identityHeader}
      {!state ? (
        <section className="gate">
          <h1>{conversion ? 'Equivalent content update' : 'Field operator access'}</h1>
          <p>{message}</p>
          {mode === 'web' && canSignIn && !gateway && <a href="/auth/login">Sign in with Twitch</a>}
          {profileChoice && mode === 'web' && gateway && (
            <section aria-label="Choose your DIME profile">
              <h2>Keep your existing Extension save</h2>
              <p>Link before starting a web profile. Two existing saves cannot be combined automatically.</p>
              {canLink ? (
                <AccountLink web api={api} csrf={gateway.csrf?.()} onLinked={() => {}} />
              ) : (
                <p>Account linking is not available yet.</p>
              )}
              <a href="/auth/login">Already linked? Sign in again</a>
              <button onClick={() => setProfileChoice(false)}>Start a new web profile instead</button>
              <p>This creates a separate save. Linking to another existing save will require support.</p>
            </section>
          )}
          {recoveryControls}
          {conversion &&
            (conversion.requestId ? (
              <button
                disabled={busy || pendingBlocked || !conversion.available}
                onClick={() => void convert()}
              >
                {conversion.available ? 'Apply reviewed equivalent update' : 'Conversion rollout disabled'}
              </button>
            ) : (
              <button disabled={busy || pendingBlocked} onClick={() => void previewConversion()}>
                Preview equivalent update
              </button>
            ))}
          <button disabled={busy || !gateway || profileChoice} onClick={() => void refresh()}>
            Retry
          </button>
        </section>
      ) : (
        <>
          <section className="world">
            <WalkingWorld
              mode={toolMode}
              state={state}
              paused={
                overlayOpen ||
                analyzing ||
                (!pendingBlocked && (!!state.world.miningSession || !!state.world.extractionSession))
              }
              onPosition={(position) => {
                playerPosition.current = position;
                setPlayerTile((old) =>
                  Math.abs(old.x - position.x) + Math.abs(old.y - position.y) > 0.2 ? position : old,
                );
              }}
              onTarget={setTargetNode}
              target={targetNode}
              scannerPulse={scannerPulse}
              marker={marker}
              vacuum={vacuumVisual}
              laser={laserVisual}
              fragmentTarget={fragmentTarget}
            />
            {toolMode === 'laser' && state.world.nodes[targetNode]?.status === 'INTACT' && (
              <div className="toolReadout" aria-label="Mining target details">
                <b>SIZE {state.world.nodes[targetNode]!.size} · INTACT</b>
                {state.world.scanner.analyzed.includes(targetNode) && (
                  <span>Instability {Math.round(state.world.nodes[targetNode]!.instability * 100)}%</span>
                )}
                {laserVisual && (
                  <span>
                    Integrity{' '}
                    {Math.max(
                      0,
                      100 - Math.round((laserVisual.progress / Math.max(1, laserVisual.stable)) * 100),
                    )}
                    % · charge {Math.round(laserVisual.charge / 10)}%
                  </span>
                )}
              </div>
            )}
            <div className="place">
              <b>{zoneInfo?.name}</b>
              <small>
                {location?.name} · {state.world.entry}
              </small>
            </div>
          </section>
          <ScannerHUD
            state={state}
            target={targetNode}
            busy={busy || pendingBlocked || !!state.world.miningSession || !!state.world.extractionSession}
            paused={overlayOpen}
            laserMode={toolMode === 'laser'}
            getPlayer={() => playerPosition.current}
            onTarget={setTargetNode}
            mutate={mutate}
            onPulse={setScannerPulse}
            onHolding={setAnalyzing}
          />
          <button
            className="menuToggle"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ☰
          </button>
          <button className="hudToggle" aria-label="Status and objective" onClick={() => setMenuOpen(true)}>
            {state.wallet.toLocaleString()} marks ·{' '}
            {formatCscuMinor(
              Object.values(state.mining['extract.x001']).reduce<number>((a, b) => a + (b ?? 0), 0),
            )}{' '}
            cSCU {objective && <span aria-hidden="true">⌖</span>}
          </button>
          {pendingBlocked && (
            <button className="recoveryBadge" onClick={() => setMenuOpen(true)}>
              Pending · Retry
            </button>
          )}
          {originalZoneMap(state.world.zone).services.some((service) =>
            nearInteraction(state.world.zone, playerTile, service),
          ) && (
            <button className="interactToggle" onClick={() => setMenuOpen(true)}>
              Interact
            </button>
          )}
          <div
            className="gameSheet"
            role={menuOpen ? 'dialog' : undefined}
            aria-modal={menuOpen || undefined}
            aria-label="Operations menu"
          >
            <button className="resumeGame" onClick={() => setMenuOpen(false)}>
              Resume game
            </button>
            {identityHeader}
            <p>
              Walk: WASD / arrows · Enter: E · Ping: P · Analyze: hold F · Next target: Q · Mine: hold Space ·
              Vacuum: hold V. Release to stop.
            </p>
            <nav className="operationsNav" onClick={() => emitGameAudio('ui')}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setMapOpen(true);
                }}
              >
                NAV
              </button>
              <button
                onClick={() =>
                  document
                    .querySelector('.miningConsole, .vacuumConsole')
                    ?.scrollIntoView({ block: 'center' })
                }
              >
                TOOL
              </button>
              <button onClick={() => document.querySelector('.status')?.scrollIntoView({ block: 'center' })}>
                CARGO
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setResetOpen(true);
                }}
              >
                PROFILE
              </button>
            </nav>
            <button
              className="keyboardOption"
              aria-pressed={touchHidden}
              onClick={() => setTouchHidden((value) => !value)}
            >
              {touchHidden ? 'Show touch controls' : 'Hide touch controls (keyboard)'}
            </button>
            <PhysicalNavigation
              state={state}
              player={playerTile}
              getPlayer={() => playerPosition.current}
              busy={busy || pendingBlocked || overlayOpen}
              mapOpen={mapOpen}
              closeMap={() => setMapOpen(false)}
              objective={objective}
              select={setObjective}
              marker={setMarker}
              mutate={mutate}
            />
            <section className="status">
              <p>{message}</p>
              {recoveryControls}
              <div>
                <span>{state.wallet.toLocaleString()} shift marks</span>
                <span>
                  Hand hold{' '}
                  {formatCscuMinor(
                    Object.values(state.mining['extract.x001']).reduce<number>((a, b) => a + (b ?? 0), 0),
                  )}{' '}
                  cSCU
                </span>
              </div>
            </section>
            <VacuumConsole
              state={state}
              paused={overlayOpen}
              busy={busy || pendingBlocked || resetOpen}
              mode={toolMode}
              setMode={setToolMode}
              getPlayer={() => playerPosition.current}
              mutate={mutate}
              onVisual={setVacuumVisual}
              onTarget={setFragmentTarget}
            />
            <MiningConsole
              onVisual={setLaserVisual}
              mode={toolMode}
              state={state}
              busy={busy || pendingBlocked}
              mutate={mutate}
              getPlayer={() => playerPosition.current}
              target={targetNode}
              onTarget={setTargetNode}
            />
            <ServiceConsole
              state={state}
              busy={busy || pendingBlocked}
              mutate={mutate}
              kinds={zoneKinds as readonly string[]}
            />
            {state.world.zone === 'zone.z012' && (
              <section className="actions">
                {!state.quest && (
                  <button
                    disabled={busy || pendingBlocked}
                    onClick={() => void mutate({ type: 'acceptFirstContract' })}
                  >
                    Begin First Contract
                  </button>
                )}
                {state.quest?.objective === 'CHECK_EQUIPMENT' && (
                  <button
                    disabled={busy || pendingBlocked}
                    onClick={() => void mutate({ type: 'confirmFirstContractTool' })}
                  >
                    Confirm Beamline One
                  </button>
                )}
                {state.quest?.objective === 'RETURN_TO_OUTPOST' && (
                  <button
                    disabled={busy || pendingBlocked}
                    onClick={() => void mutate({ type: 'sellFirstContractMaterial' })}
                  >
                    Sell 4 cSCU Garnet · 5,200 shift marks
                  </button>
                )}
                {state.quest?.objective === 'RETURN_TO_FOREMAN' && (
                  <button
                    disabled={busy || pendingBlocked}
                    onClick={() => void mutate({ type: 'completeFirstContract' })}
                  >
                    Report completed field work · 500 reward
                  </button>
                )}
                {state.quest?.status === 'COMPLETE' && (
                  <span>First Contract complete · mined 4 cSCU · sold 4 cSCU</span>
                )}
              </section>
            )}
            {legalFooter}
          </div>
          {resetOpen && (
            <div className="modal" role="dialog" aria-label="Reset game progress">
              <section>
                <h2>About DIME</h2>
                <p>
                  DIME is an original industrial exploration game operated by Dsepticon. Destroya Industries
                  is the central employer in the Cairncoil Reach.
                </p>
                <p>
                  Dorathaadestroya is recognized as Founder and Operations Director. The game uses no creator
                  likeness, voice, private biography, or attributed dialogue.
                </p>
                <p>{ORIGINAL_CONTENT.materialDisclaimer}</p>
                {canLink && !busy && !pendingBlocked && (
                  <AccountLink
                    web={mode === 'web'}
                    api={api}
                    csrf={gateway?.csrf?.()}
                    token={gateway?.token()}
                    onLinked={() => {
                      requestEpoch.current += 1;
                      setResetOpen(false);
                      void refresh();
                    }}
                  />
                )}
                <h2>Reset Game Progress</h2>
                <p>
                  Gameplay reset is different from content conversion and verified privacy deletion. Technical
                  receipts and recoverable backups follow the retention periods in the Privacy Policy.
                </p>
                <p>
                  This resets DIME progress across every Twitch channel. Wallet, fleet, equipment, cargo,
                  processing orders, location and assignments return to canonical defaults. Your Twitch
                  account is unaffected. This cannot be undone through the game.
                </p>
                <label>
                  Type exactly <b>RESET MY DIME PROFILE</b>
                  <input
                    value={resetPhrase}
                    onChange={(e) => setResetPhrase(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                  />
                </label>
                <button
                  disabled={busy || pendingBlocked || resetPhrase !== 'RESET MY DIME PROFILE'}
                  onClick={() => void reset()}
                >
                  {busy ? 'Resetting…' : 'Reset All My Game Progress'}
                </button>
                <button onClick={() => setResetOpen(false)}>Cancel</button>
              </section>
            </div>
          )}
        </>
      )}
      {!state && legalFooter}
    </main>
  );
}
export default App;
