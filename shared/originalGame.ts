import { ORIGINAL_CONTENT } from './originalCatalog';
import { OriginalPlayerState, originalStateSchema } from './originalSchema';

/** Canonical new-player gameplay defaults for the original Destroya setting. */
export function originalInitialState(
  generation: string,
  random: () => number = Math.random,
): OriginalPlayerState {
  const refineryRates = Object.fromEntries(
    ORIGINAL_CONTENT.refineryMethods.map((method) => {
      const low = { Low: 30, Medium: 50, High: 70 }[method.profile.yield];
      return [
        method.id,
        {
          yield: low * 10_000 + Math.floor(random() * 200_001),
          cost: 750_000 + Math.floor(random() * 500_001),
          time: 750_000 + Math.floor(random() * 500_001),
        },
      ];
    }),
  );
  return originalStateSchema.parse({
    schemaVersion: 3,
    saveFormatVersion: 3,
    contentVersion: 4,
    quantityVersion: 2,
    saveGeneration: generation,
    revision: 0,
    wallet: 0,
    walletRemainder: 0,
    location: 'loc.l001',
    currentShip: 'fleet.v001',
    ships: { 'fleet.v001': 1 },
    equipment: { 'gear.e001': 1 },
    positions: { 'fleet.v001': 'loc.l001' },
    mining: {
      'extract.x001': {},
      'extract.x002': {},
      'extract.x003': {},
      'extract.x004': {},
    },
    cargo: { 'fleet.v001': { raw: {}, refined: {} } },
    orders: [],
    refineryRates,
    pending: null,
    world: {
      zone: 'zone.z001',
      entry: 'arrival',
      nodes: {},
      scanner: { pings: 0, analyses: 0, analyzed: [], scannedZones: [] },
      miningSession: null,
      extractionSession: null,
      groundVehicle: null,
      departure: null,
    },
  });
}
