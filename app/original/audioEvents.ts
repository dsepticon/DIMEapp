/** Silent, bounded event hooks for future original audio. No assets, device or network access. */
export type GameAudioEvent =
  | 'footstep'
  | 'terminal'
  | 'laser'
  | 'optimal'
  | 'danger'
  | 'fracture'
  | 'vacuum'
  | 'collection'
  | 'transit'
  | 'ui';
type Listener = (event: GameAudioEvent) => void;
const listeners = new Set<Listener>();
export function onGameAudio(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function emitGameAudio(event: GameAudioEvent) {
  for (const listener of listeners) listener(event);
}
