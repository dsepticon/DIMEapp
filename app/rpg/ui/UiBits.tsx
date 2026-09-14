import { useEffect, useRef, useState } from 'react';
import { Ore } from '../../../shared/schema';
import { P } from '../palette';
import { drawMiner } from '../sprites';
import { formatCscuMinor, formatScuMinor, parseCscuMinor } from '../../../shared/mineralUnits';
import styles from './GameUI.module.css';

const oreColours: Partial<Record<Ore, string>> = {
  Dolivine: P.green,
  Aphorite: P.rose,
  Hadanite: P.violet,
  Janalite: P.cyanLight,
  Agricium: P.amber,
  Quantanium: P.cyan,
};

export function OreIcon({ ore }: { ore: Ore }) {
  return (
    <span
      className={styles.oreIcon}
      style={{ '--ore': oreColours[ore] ?? P.blue } as React.CSSProperties}
      aria-hidden="true"
    >
      <i />
    </span>
  );
}

export function PixelPortrait({ label = 'Miner portrait' }: { label?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawMiner(ctx, 8, 20, 'down', 0, 0, true);
  }, []);
  return (
    <canvas ref={canvas} width={16} height={22} className={styles.portrait} role="img" aria-label={label} />
  );
}

export function ChoiceRail<T extends string>({
  label,
  choices,
  value,
  onChange,
  disabled,
}: {
  label: string;
  choices: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: (value: T) => boolean;
}) {
  return (
    <div className={styles.choiceBlock}>
      <strong>{label}</strong>
      <div className={styles.choices} role="group" aria-label={label}>
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={value === choice}
            disabled={disabled?.(choice)}
            onClick={() => onChange(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const set = (next: number) => onChange(max <= 0 ? 0 : Math.max(1, Math.min(max, next)));
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <strong>{label}</strong>
      <div>
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => set(value - 1)}>
          −
        </button>
        <input
          aria-label={`${label} in cSCU`}
          value={draft ?? formatCscuMinor(value)}
          inputMode="decimal"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={() => {
            const parsed = parseCscuMinor(draft ?? formatCscuMinor(value));
            if (parsed !== null) set(parsed);
            setDraft(null);
          }}
        />
        <span aria-label={label}>{formatCscuMinor(value)} cSCU</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => set(value + 1)}>
          +
        </button>
      </div>
      <div className={styles.presets}>
        <button type="button" onClick={() => set(1)}>
          0.01 cSCU
        </button>
        <button type="button" onClick={() => set(100)}>
          1 cSCU
        </button>
        <button type="button" onClick={() => set(10_000)}>
          1 SCU
        </button>
        <button type="button" onClick={() => set(max)}>
          Max
        </button>
      </div>
    </div>
  );
}

export function CapacityBar({ label, used, capacity }: { label: string; used: number; capacity: number }) {
  const fill = capacity ? Math.min(100, Math.round((100 * used) / capacity)) : 0;
  return (
    <div className={styles.capacity}>
      <div>
        <strong>{label}</strong>
        <span>
          {formatScuMinor(used)} / {formatScuMinor(capacity)} SCU
        </span>
      </div>
      <div
        className={styles.capacityTrack}
        role="progressbar"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemax={capacity}
      >
        <i style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

export function Dialogue({
  speaker,
  text,
  critical = false,
  onAdvance,
  choices,
  portrait,
}: {
  speaker: string;
  text: string;
  critical?: boolean;
  onAdvance: () => void;
  choices?: { label: string; action: () => void }[];
  portrait?: 'foreman' | 'technician' | 'officer';
}) {
  const reduced = useRef(
    typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(critical || reduced.current ? text.length : 0);
  useEffect(() => {
    if (critical || reduced.current) {
      setVisible(text.length);
      return;
    }
    const timer = window.setInterval(() => setVisible((count) => Math.min(text.length, count + 2)), 24);
    return () => window.clearInterval(timer);
  }, [critical, text]);
  const advance = () => {
    if (visible < text.length) setVisible(text.length);
    else onAdvance();
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (['Enter', 'Space', 'KeyE'].includes(event.code)) {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  return (
    <div className={styles.dialogueShade}>
      <section className={styles.dialogue} role="dialog" aria-label={speaker}>
        <div className={styles.speaker}>
          {portrait ? (
            <span aria-hidden="true" className={`${styles.npcPortrait} ${styles[portrait]}`}>
              <i />
              <b />
            </span>
          ) : (
            <span aria-hidden="true">✦</span>
          )}
          <strong>{speaker}</strong>
        </div>
        <p aria-live={visible === text.length ? 'polite' : 'off'}>{text.slice(0, visible)}</p>
        {visible < text.length ? (
          <button type="button" onClick={advance}>
            Show all ▸
          </button>
        ) : choices ? (
          <div>
            {choices.map((choice) => (
              <button type="button" key={choice.label} onClick={choice.action}>
                {choice.label}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={advance}>
            Continue ▸
          </button>
        )}
      </section>
    </div>
  );
}
