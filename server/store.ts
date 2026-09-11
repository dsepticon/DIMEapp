import { PlayerState } from '../shared/schema';
export interface Receipt {
  fingerprint: string;
  expiresAt: number;
}
export interface Store {
  read(player: string): Promise<PlayerState | undefined>;
  receipt(player: string, id: string): Promise<Receipt | undefined>;
  commit(
    player: string,
    expected: number | null,
    state: PlayerState,
    request?: { id: string; receipt: Receipt },
  ): Promise<boolean>;
}
export class MemoryStore implements Store {
  states = new Map<string, PlayerState>();
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
    state: PlayerState,
    request?: { id: string; receipt: Receipt },
  ) {
    const current = this.states.get(player);
    if (
      (expected === null ? current !== undefined : current?.revision !== expected) ||
      (request && this.receipts.has(player + ':' + request.id))
    )
      return false;
    this.states.set(player, structuredClone(state));
    if (request) this.receipts.set(player + ':' + request.id, request.receipt);
    return true;
  }
}
