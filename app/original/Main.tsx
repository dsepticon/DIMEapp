import { useEffect, useRef, useState } from 'react';
import { twitchConnection, type TwitchSession } from '../twitch';
import { originalStateSchema, type OriginalPlayerState } from '../../shared/originalSchema';
import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import { originalZoneMap } from '../../shared/originalWorld';
import { formatCscuMinor } from '../../shared/mineralUnits';
import { originalTravelService } from '../../shared/originalTravel';
import './original.css';
import { MiningConsole } from './MiningConsole';
import { WalkingWorld } from './WalkingWorld';
import type { Position } from './walking';
import { ServiceConsole } from './ServiceConsole';

type Gateway = {
  token(): string | undefined;
  identity(): string | undefined;
  expired(token: string | undefined): void;
  stop(): void;
};
const uuid = () => crypto.randomUUID();
function App() {
  const configuredApi = import.meta.env.VITE_DIME_API_URL as string | undefined;
  const api = (
    configuredApi || (import.meta.env.VITE_DIME_MODE === 'local' ? 'http://127.0.0.1:8787' : '')
  ).replace(/\/$/, '');
  const mode = import.meta.env.VITE_DIME_MODE || 'web';
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
  const playerPosition = useRef<Position>({ x: 0, y: 0 });
  const [targetNode, setTargetNode] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [pendingBlocked, setPendingBlocked] = useState(false);
  const pendingKey = () => {
    const identity = gateway?.identity();
    return identity ? `dime-pending-v2:${identity}` : '';
  };
  useEffect(() => {
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
  const request = async (path: string, body?: unknown) => {
    if (!api) throw Error('Backend URL is not configured.');
    const token = gateway?.token();
    const response = await fetch(api + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (response.status === 401) gateway?.expired(token);
    const value = await response.json();
    if (!response.ok) throw Error(typeof value.message === 'string' ? value.message : 'Request failed.');
    return value as Record<string, unknown>;
  };
  const refresh = async () => {
    if (mode === 'web') {
      setMessage('Web sign-in is planned for Milestone 4.2. No OAuth credentials are configured.');
      return;
    }
    if (!gateway?.identity()) return;
    setBusy(true);
    try {
      const value = await request('/v4/state');
      if (value.conversionRequired) {
        const key = pendingKey(),
          raw = key ? sessionStorage.getItem(key) : null;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as { version?: number; request?: unknown; saveGeneration?: string };
            if (saved.saveGeneration && saved.saveGeneration !== String(value.saveGeneration))
              sessionStorage.removeItem(key);
            else {
              const legacyRequest = saved.version === 1 ? saved.request : saved;
              if (!legacyRequest) throw Error('Pending action is invalid.');
              await request('/actions', legacyRequest);
              sessionStorage.removeItem(key);
              const updated = await request('/v4/state');
              value.revision = updated.revision;
              value.saveGeneration = updated.saveGeneration;
              setMessage('Pending action recovered safely before content update.');
            }
          } catch {
            setPendingBlocked(true);
            setMessage(
              'Pending action recovery failed safely. Retry the same action before content conversion.',
            );
            return;
          }
        }
        setPendingBlocked(false);
        const available = value.conversionAvailable === true;
        setConversion({
          revision: Number(value.revision),
          saveGeneration: String(value.saveGeneration),
          available,
        });
        setMessage(
          available
            ? 'Your established operation is eligible for a reviewed equivalent content update.'
            : 'Equivalent content preview is available. Permanent conversion is not enabled.',
        );
      } else {
        let canonical = originalStateSchema.parse(value.state);
        const key = pendingKey(),
          raw = key ? sessionStorage.getItem(key) : null;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as {
              version?: number;
              path?: string;
              request?: { expectedGeneration?: string };
            };
            if (saved.version !== 4 || saved.path !== '/v4/actions' || !saved.request) {
              setPendingBlocked(true);
              setMessage(
                'An earlier pending action must be recovered in the current Hosted Test client before content conversion.',
              );
              setState(canonical);
              return;
            }
            if (saved.request.expectedGeneration !== canonical.saveGeneration) sessionStorage.removeItem(key);
            else {
              const recovered = await request(saved.path, saved.request);
              canonical = originalStateSchema.parse(recovered.state);
              sessionStorage.removeItem(key);
              setMessage('Pending action recovered safely.');
            }
          } catch {
            setPendingBlocked(true);
            setMessage(
              'Pending action recovery needs attention. Retry without clearing other browser storage.',
            );
            setState(canonical);
            return;
          }
        }
        setPendingBlocked(false);
        setState(canonical);
        setConversion(null);
        setMessage('Operation synchronized.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection unavailable.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
    // Refresh is intentionally keyed to the authenticated gateway/session boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway, session.status]);
  const mutate = async (action: Record<string, unknown>): Promise<OriginalPlayerState | null> => {
    if (!state || busy || pendingBlocked) return null;
    setBusy(true);
    try {
      const actionRequest = {
        requestId: uuid(),
        expectedRevision: state.revision,
        expectedGeneration: state.saveGeneration,
        action,
      };
      const key = pendingKey();
      if (!key) throw Error('Authenticated session is unavailable.');
      sessionStorage.setItem(
        key,
        JSON.stringify({ version: 4, path: '/v4/actions', request: actionRequest }),
      );
      const value = await request('/v4/actions', actionRequest);
      const next = originalStateSchema.parse(value.state);
      setState(next);
      sessionStorage.removeItem(key);
      setMessage('Action confirmed.');
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action rejected.');
      return null;
    } finally {
      setBusy(false);
    }
  };
  const convert = async () => {
    if (!conversion?.requestId || busy || pendingBlocked) return;
    setBusy(true);
    try {
      const value = await request('/v4/content/convert', {
        requestId: conversion.requestId,
        expectedRevision: conversion.revision,
        expectedGeneration: conversion.saveGeneration,
      });
      setState(originalStateSchema.parse(value.state));
      setConversion(null);
      setMessage('Operation updated with equivalent holdings and progress.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Content review required.');
    } finally {
      setBusy(false);
    }
  };
  const previewConversion = async () => {
    if (!conversion || busy || pendingBlocked) return;
    setBusy(true);
    try {
      const requestId = uuid();
      await request('/v4/content/preview', {
        requestId,
        expectedRevision: conversion.revision,
        expectedGeneration: conversion.saveGeneration,
      });
      setConversion({ ...conversion, requestId });
      setMessage('Preview verified: values, quantities, ownership, orders and progress remain equivalent.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Content review required.');
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!state || resetPhrase !== 'RESET MY DIME PROFILE' || busy) return;
    setBusy(true);
    try {
      const value = await request('/v4/profile/reset', {
        requestId: uuid(),
        expectedRevision: state.revision,
        expectedGeneration: state.saveGeneration,
        confirmation: resetPhrase,
      });
      setState(originalStateSchema.parse(value.state));
      const identity = gateway?.identity();
      if (identity) sessionStorage.removeItem(`dime-pending-v2:${identity}`);
      setResetOpen(false);
      setResetPhrase('');
      setMessage('Game progress reset.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Reset failed safely.');
    } finally {
      setBusy(false);
    }
  };
  const zone = state ? originalZoneMap(state.world.zone) : null;
  const location = ORIGINAL_CONTENT.locations.find((x) => x.id === state?.location);
  const zoneInfo = ORIGINAL_CONTENT.zones.find((x) => x.id === state?.world.zone);
  const zoneKinds = zoneInfo?.objectKinds ?? [];
  return (
    <main className="originalApp">
      <header>
        <div>
          <strong>D.I.M.E.</strong>
          <small>DESTROYA INDUSTRIES MINING EXPERIENCE</small>
        </div>
        <span>{location?.name ?? 'Secure connection'}</span>
      </header>
      {!state ? (
        <section className="gate">
          <h1>{conversion ? 'Equivalent content update' : 'Field operator access'}</h1>
          <p>{message}</p>
          {conversion &&
            (conversion.requestId ? (
              <button disabled={busy || !conversion.available} onClick={() => void convert()}>
                {conversion.available ? 'Apply reviewed equivalent update' : 'Conversion rollout disabled'}
              </button>
            ) : (
              <button disabled={busy} onClick={() => void previewConversion()}>
                Preview equivalent update
              </button>
            ))}
          <button disabled={busy || mode === 'web'} onClick={() => void refresh()}>
            Retry
          </button>
        </section>
      ) : (
        <>
          <section className="world">
            <WalkingWorld
              state={state}
              paused={resetOpen || !!state.world.miningSession || !!state.world.extractionSession}
              onPosition={(position) => {
                playerPosition.current = position;
              }}
              onTarget={setTargetNode}
              target={targetNode}
            />
            <div className="place">
              <b>{zoneInfo?.name}</b>
              <small>
                {location?.name} · {state.world.entry}
              </small>
            </div>
          </section>
          <nav>
            <button
              onClick={() =>
                setMessage(`Connected exits: ${zone?.exits.length ?? 0}. Select a marked doorway below.`)
              }
            >
              NAV
            </button>
            <button onClick={() => setMessage('Beamline One · Laser / Extraction')}>TOOL</button>
            <button onClick={() => setMessage(ORIGINAL_CONTENT.materialDisclaimer)}>CARGO</button>
            <button onClick={() => setResetOpen(true)}>PROFILE</button>
          </nav>
          <section className="exits" aria-label="Connected doorways">
            {zone?.exits.map((exit) => {
              const destination = ORIGINAL_CONTENT.zones.find((item) => item.id === exit.to);
              return (
                <button
                  key={exit.to}
                  disabled={busy}
                  onClick={() => void mutate({ type: 'moveZone', destination: exit.to })}
                >
                  {exit.facing} · {destination?.name}
                </button>
              );
            })}
          </section>
          <section className="status">
            <p>{message}</p>
            {pendingBlocked && (
              <button disabled={busy} onClick={() => void refresh()}>
                Retry pending action
              </button>
            )}
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
          <MiningConsole
            state={state}
            busy={busy}
            mutate={mutate}
            getPlayer={() => playerPosition.current}
            target={targetNode}
            onTarget={setTargetNode}
          />
          <ServiceConsole state={state} busy={busy} mutate={mutate} kinds={zoneKinds as readonly string[]} />
          {state.world.zone === originalTravelService(state.location).assign && !state.world.departure && (
            <section className="actions">
              {ORIGINAL_CONTENT.locations
                .filter((item) => item.id !== state.location)
                .map((item) => (
                  <button
                    key={item.id}
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        type: 'assignDeparture',
                        ship: state.currentShip,
                        destination: item.id,
                        loadGroundVehicle: false,
                      })
                    }
                  >
                    Assign {item.name}
                  </button>
                ))}
            </section>
          )}
          {state.world.zone === originalTravelService(state.location).depart && state.world.departure && (
            <section className="actions">
              <button disabled={busy} onClick={() => void mutate({ type: 'completeDeparture' })}>
                Depart assigned bay
              </button>
            </section>
          )}
          {(zoneKinds as readonly string[]).includes('vehicle_terminal') && (
            <section className="actions">
              {!state.world.groundVehicle ? (
                <button
                  disabled={busy || (state.ships['fleet.v002'] ?? 0) < 1}
                  onClick={() => void mutate({ type: 'retrieveGroundRig' })}
                >
                  Retrieve owned Trailbug Ground Rig
                </button>
              ) : state.world.groundVehicle.occupied ? (
                <button
                  disabled={busy}
                  onClick={() => void mutate({ type: 'setGroundRigOccupied', occupied: false })}
                >
                  Exit ground rig
                </button>
              ) : (
                <>
                  <button
                    disabled={busy}
                    onClick={() => void mutate({ type: 'setGroundRigOccupied', occupied: true })}
                  >
                    Enter ground rig
                  </button>
                  <button disabled={busy} onClick={() => void mutate({ type: 'stowGroundRig' })}>
                    Stow ground rig
                  </button>
                </>
              )}
            </section>
          )}
          {state.world.zone === 'zone.z012' && (
            <section className="actions">
              {!state.quest && (
                <button disabled={busy} onClick={() => void mutate({ type: 'acceptFirstContract' })}>
                  Begin First Contract
                </button>
              )}
              {state.quest?.objective === 'CHECK_EQUIPMENT' && (
                <button disabled={busy} onClick={() => void mutate({ type: 'confirmFirstContractTool' })}>
                  Confirm Beamline One
                </button>
              )}
              {state.quest?.objective === 'RETURN_TO_OUTPOST' && (
                <button disabled={busy} onClick={() => void mutate({ type: 'sellFirstContractMaterial' })}>
                  Sell 4 cSCU Garnet · 5,200 shift marks
                </button>
              )}
              {state.quest?.objective === 'RETURN_TO_FOREMAN' && (
                <button disabled={busy} onClick={() => void mutate({ type: 'completeFirstContract' })}>
                  Report completed field work · 500 reward
                </button>
              )}
              {state.quest?.status === 'COMPLETE' && (
                <span>First Contract complete · mined 4 cSCU · sold 4 cSCU</span>
              )}
            </section>
          )}
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
              DIME is an original industrial exploration game operated by Dsepticon. No creator likeness,
              voice, biography, or attributed dialogue is used.
            </small>
          </footer>
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
                  disabled={busy || resetPhrase !== 'RESET MY DIME PROFILE'}
                  onClick={() => void reset()}
                >
                  {busy ? 'Resetting…' : 'Reset All My Game Progress'}
                </button>
                <button disabled={busy} onClick={() => setResetOpen(false)}>
                  Cancel
                </button>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
export default App;
