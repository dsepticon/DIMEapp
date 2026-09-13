import { Action, PlayerState } from '../../shared/schema';

export type DepositResult = 'submitted' | 'busy' | 'travel-required';

// The scene has no API client. This adapter submits one authoritative action per interaction.
export class MiningActionAdapter {
  private inFlight = false;
  get busy() {
    return this.inFlight;
  }
  async requestDeposit(
    state: PlayerState,
    canAct: boolean,
    submit: (action: Action) => Promise<void>,
  ): Promise<DepositResult> {
    if (this.inFlight) return 'busy';
    if (state.location !== 'Lyria') return 'travel-required';
    if (!canAct || state.pending) return 'busy';
    this.inFlight = true;
    try {
      await submit({ type: 'mine', source: 'Hand', head: 'Arbor MH1', crew: 'Terraphon', extraStations: [] });
      return 'submitted';
    } finally {
      this.inFlight = false;
    }
  }
}
