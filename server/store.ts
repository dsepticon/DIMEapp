import { PlayerState } from '../shared/schema';
export interface Receipt {
  fingerprint: string;
  expiresAt: number;
}
type RevisionedState = { revision: number; saveGeneration?: string };
export interface Store<State extends RevisionedState = PlayerState> {
  read(player: string): Promise<State | undefined>;
  receipt(player: string, id: string): Promise<Receipt | undefined>;
  commit(
    player: string,
    expected: number | null,
    state: State,
    request?: { id: string; receipt: Receipt },
    generationGuard?: string | null,
  ): Promise<boolean>;
}
export class MemoryStore<State extends RevisionedState = PlayerState> implements Store<State> {
  states = new Map<string, State>();
  receipts = new Map<string, Receipt>();
  async read(player: string) {
    const value = this.states.get(player);
    return value ? structuredClone(value) : undefined;
  }
  async receipt(player: string, id: string) {
    return this.receipts.get(player + ':' + id);
  }
  async commit(
    player: string,
    expected: number | null,
    state: State,
    request?: { id: string; receipt: Receipt },
    generationGuard?: string | null,
  ) {
    const current = this.states.get(player);
    if (
      (expected === null ? current !== undefined : current?.revision !== expected) ||
      (generationGuard !== undefined && (current?.saveGeneration ?? null) !== generationGuard) ||
      (request && this.receipts.has(player + ':' + request.id))
    )
      return false;
    this.states.set(player, structuredClone(state));
    if (request) this.receipts.set(player + ':' + request.id, request.receipt);
    return true;
  }
}
