import { describe, expect, it } from 'vitest';
import { previewLegacySave } from '../server/legacy-preview';

// Entirely synthetic, anonymized shapes from archived source; no player records.
const fixture = () => ({
  wallet: 4321,
  ships: { Nomad: 1, Prospector: 1 },
  currentShip: 'Nomad',
  currentLocation: 'ARC-L1',
  shipLocations: { Nomad: 'ARC-L1' },
  miningHeads: { 'Helix I': 1 },
  crew: { Dora: 2 },
  miningInventories: { Hand: { Hadanite: 25 }, Prospector: { Gold: 1.25 } },
  cargoInventories: { Nomad: { Ores: { Hadanite: 0.29 }, Refined: { 'Refined Gold': 2.5 } } },
  workOrders: [{ id: 1000, inventory: 'Prospector', refinedOre: { 'Refined Gold': 1.25 }, time: 60 }],
  claims: [{ id: 'synthetic-claim', amount: 7 }],
});
describe('offline legacy migration preview', () => {
  it('preserves the complete source and never emits writable state', () => {
    const source = fixture();
    const before = structuredClone(source);
    const preview = previewLegacySave(source);
    expect(source).toEqual(before);
    expect(preview.original).toEqual(before);
    expect(preview.productionWritesEnabled).toBe(false);
    expect(preview).not.toHaveProperty('state');
    source.wallet = 0;
    expect(preview.original.wallet).toBe(4321);
  });
  it('is deterministic and safe to retry without duplicating claims or orders', () => {
    const first = previewLegacySave(fixture());
    expect(previewLegacySave(first.original)).toEqual(first);
    expect(first.original.workOrders).toHaveLength(1);
    expect(first.original.claims).toHaveLength(1);
  });
  it('maps mixed legacy units exactly, including floating point-sensitive decimals', () => {
    const mapped = Object.fromEntries(previewLegacySave(fixture()).mappings.map((m) => [m.to, m.value]));
    expect(mapped['mining.Hand.Hadanite']).toBe(25);
    expect(mapped['mining.Prospector.Gold']).toBe(125);
    expect(mapped['cargo.Nomad.raw.Hadanite']).toBe(29);
    expect(mapped['cargo.Nomad.refined.Gold']).toBe(250);
    expect(mapped.wallet).toBe(4321);
  });
  it('retains orders, claims and unknown nested inventory for reconciliation', () => {
    const source = { ...fixture(), miningInventories: { Refined: { Gold: 2 }, Hand: { Mystery: 5 } } };
    const result = previewLegacySave(source);
    expect(result.original).toEqual(source);
    expect(result.flags.map((f) => f.field)).toEqual(
      expect.arrayContaining([
        'workOrders',
        'claims',
        'miningInventories.Refined',
        'miningInventories.Hand.Mystery',
      ]),
    );
  });
  it('does not round fractional units or clamp balances', () => {
    const result = previewLegacySave({ wallet: -1, miningInventories: { Prospector: { Gold: 0.001 } } });
    expect(result.mappings).toEqual([]);
    expect(result.original.wallet).toBe(-1);
  });
  it('does not infer refined status from the broken legacy transfer category', () => {
    const result = previewLegacySave({ cargoInventories: { Nomad: { Refined: { Gold: 5 } } } });
    expect(result.mappings).toEqual([]);
    expect(result.flags[0].reason).toContain('ambiguous');
  });
  it('retains ciphertext and malformed values without resetting them', () => {
    const source = { wallet: 'synthetic-ciphertext', cargoInventories: '{broken-json' };
    const result = previewLegacySave(source);
    expect(result.original).toEqual(source);
    expect(result.mappings).toEqual([]);
  });
  it('rejects guessed location precedence and colliding equipment', () => {
    const result = previewLegacySave({
      currentLocation: 'ARC-L1',
      characterLocation: 'Area-18',
      crew: { Dora: 1 },
      miningHeads: { Dora: 2 },
    });
    expect(result.mappings).toEqual([]);
    expect(result.flags).toHaveLength(5);
  });
  it.each([2, 3])('does not remigrate explicit save version %s', (schemaVersion) => {
    const source = { ...fixture(), schemaVersion };
    expect(previewLegacySave(source).mappings).toEqual([]);
    expect(previewLegacySave(source).original).toEqual(source);
  });
});
