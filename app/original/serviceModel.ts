import { ORIGINAL_CONTENT } from '../../shared/originalCatalog';
import type { OriginalPlayerState } from '../../shared/originalSchema';
import { formatCscuMinor, settleSale } from '../../shared/mineralUnits';

export const quantity = (units: number) => `${formatCscuMinor(units)} cSCU`;
export const materialName = (id: string) =>
  ORIGINAL_CONTENT.minerals.find((m) => m.id === id)?.name ?? 'Unknown material';
export function serviceInventory(state: OriginalPlayerState) {
  const ships = ORIGINAL_CONTENT.shipsAndVehicles
    .filter(
      (ship) =>
        ship.cargoRole && (state.ships[ship.id] ?? 0) > 0 && state.positions[ship.id] === state.location,
    )
    .map((ship) => {
      const hold = state.cargo[ship.id];
      const used = [...Object.values(hold?.raw ?? {}), ...Object.values(hold?.refined ?? {})].reduce<number>(
        (sum, n) => sum + (n ?? 0),
        0,
      );
      const capacity = (ship.capacityCscu ?? 0) * 100;
      return { id: ship.id, name: ship.name, used, capacity, free: Math.max(0, capacity - used) };
    });
  const raw = Object.entries(state.mining).flatMap(([source, hold]) => {
    const asset =
      source === 'extract.x002' ? 'fleet.v002' : source === 'extract.x003' ? 'fleet.v003' : 'fleet.v004';
    if (
      source !== 'extract.x001' &&
      (!(state.ships[asset] ?? 0) || state.positions[asset] !== state.location)
    )
      return [];
    const sourceName =
      source === 'extract.x001'
        ? 'Hand hold'
        : ORIGINAL_CONTENT.shipsAndVehicles.find((s) => s.id === asset)!.name;
    return Object.entries(hold)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([material, n]) => ({
        key: `${source}:${material}`,
        source,
        sourceName,
        material,
        units: n ?? 0,
        processable:
          ['extract.x003', 'extract.x004'].includes(source) &&
          !!ORIGINAL_CONTENT.minerals.find((m) => m.id === material)?.refinable,
      }));
  });
  const cargo = ships.flatMap((ship) =>
    (['raw', 'refined'] as const).flatMap((category) =>
      Object.entries(state.cargo[ship.id]?.[category] ?? {})
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([id, n]) => {
          const material = id.replace(/\.processed$/, '');
          const mineral = ORIGINAL_CONTENT.minerals.find((m) => m.id === material);
          const price =
            category === 'raw'
              ? mineral?.rawSale
                ? mineral.rawPricePerScu
                : 0
              : (mineral?.processedPricePerScu ?? 0);
          return {
            key: `${ship.id}:${category}:${material}`,
            ship: ship.id,
            shipName: ship.name,
            category,
            material,
            units: n ?? 0,
            price,
          };
        }),
    ),
  );
  return { ships, raw, cargo };
}
export function salePreview(state: OriginalPlayerState, units: number, price: number) {
  return settleSale(units, price, state.walletRemainder ?? 0).credit;
}
