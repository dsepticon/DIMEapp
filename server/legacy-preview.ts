import { createHash } from 'node:crypto';
import { z } from 'zod';
import { stateSchema, oreSchema, shipSchema, locationSchema, units } from '../shared/schema';

// Offline review only. No Store, AWS, browser storage, or HTTP integration.
export function previewLegacySave(source: Record<string, unknown>) {
  const original = structuredClone(source);
  const mappings: { from: string; to: string; value: unknown }[] = [];
  const flags: { field: string; reason: string }[] = [];
  const flag = (field: string, reason: string) => flags.push({ field, reason });
  const map = (from: string, to: string, value: unknown, schema: z.ZodType) => {
    if (schema.safeParse(value).success) mappings.push({ from, to, value: structuredClone(value) });
    else flag(from, 'Invalid or out-of-range value; retained without coercion or reset.');
  };
  const object = (field: string, value: unknown): Record<string, unknown> => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    flag(field, 'Expected decoded object; retain original, including undecoded ciphertext.');
    return {};
  };
  const quantity = (field: string, to: string, value: unknown, scale: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      flag(field, 'Invalid quantity; retained.');
      return;
    }
    // Decimal text avoids rounding away fractions below one cSCU.
    const decimal = String(value).split('.');
    if (scale === 100 && !String(value).includes('e') && (decimal[1]?.length ?? 0) <= 2) {
      map(field, to, Number(decimal[0]) * 100 + Number((decimal[1] ?? '').padEnd(2, '0')), units);
    } else if (scale === 1) map(field, to, value, units);
    else flag(field, 'SCU cannot be represented exactly as integer cSCU; retain for review.');
  };
  const inventory = (field: string, to: string, value: unknown, scale: number, refined = false) => {
    for (const [name, count] of Object.entries(object(field, value))) {
      const ore = refined && name.startsWith('Refined ') ? name.slice(8) : name;
      if (!oreSchema.safeParse(ore).success || (refined && !name.startsWith('Refined '))) {
        flag(`${field}.${name}`, 'Unknown ore or ambiguous legacy refined category; retained.');
      } else quantity(`${field}.${name}`, `${to}.${ore}`, count, scale);
    }
  };
  if (source.schemaVersion !== undefined) {
    flag(
      'schemaVersion',
      source.schemaVersion === 2
        ? 'Already versioned; use the current reader, never remigrate or reset.'
        : 'Unsupported explicit version; retain for a version-specific reader.',
    );
  } else {
    for (const [field, value] of Object.entries(source)) {
      if (field === 'wallet') map(field, field, value, stateSchema.shape.wallet);
      else if (field === 'ships') map(field, field, value, stateSchema.shape.ships);
      else if (field === 'currentShip') map(field, field, value, shipSchema);
      else if (field === 'shipLocations') map(field, 'positions', value, stateSchema.shape.positions);
      else if (field === 'currentLocation' || field === 'characterLocation') {
        if (
          source.currentLocation !== undefined &&
          source.characterLocation !== undefined &&
          source.currentLocation !== source.characterLocation
        )
          flag(field, 'Conflicting location fields; no precedence guessed.');
        else map(field, 'location', value, locationSchema);
      } else if (field === 'miningHeads' || field === 'crew') {
        for (const [name, count] of Object.entries(object(field, value))) {
          const other = source[field === 'crew' ? 'miningHeads' : 'crew'];
          if (other && typeof other === 'object' && Object.hasOwn(other, name))
            flag(`${field}.${name}`, 'Equipment names collide; do not sum or overwrite.');
          else map(`${field}.${name}`, `equipment.${name}`, count, z.number().int().min(0).max(100));
        }
      } else if (field === 'miningInventories') {
        for (const [kind, contents] of Object.entries(object(field, value))) {
          if (['Hand', 'Roc', 'Prospector', 'Mole'].includes(kind))
            inventory(
              `${field}.${kind}`,
              `mining.${kind}`,
              contents,
              ['Hand', 'Roc'].includes(kind) ? 1 : 100,
            );
          else
            flag(
              `${field}.${kind}`,
              'Auxiliary Ships/Refined or unknown inventory; reconcile duplicates before mapping.',
            );
        }
      } else if (field === 'cargoInventories') {
        for (const [ship, hold] of Object.entries(object(field, value))) {
          if (!shipSchema.safeParse(ship).success) {
            flag(`${field}.${ship}`, 'Unknown ship; retained.');
            continue;
          }
          for (const [category, contents] of Object.entries(object(`${field}.${ship}`, hold))) {
            if (category === 'Ores' || category === 'Refined')
              inventory(
                `${field}.${ship}.${category}`,
                `cargo.${ship}.${category === 'Ores' ? 'raw' : 'refined'}`,
                contents,
                100,
                category === 'Refined',
              );
            else flag(`${field}.${ship}.${category}`, 'Unknown cargo category; retained.');
          }
        }
      } else
        flag(
          field,
          field === 'workOrders'
            ? 'Retain all orders and remaining outputs: legacy raw inputs, paid cost and deadlines are not reliably recoverable.'
            : 'No approved mapping, including claims, integrity hashes and UI preferences; retained.',
        );
    }
  }
  flag(
    '$record',
    'Identity binding, missing fields and economic reconciliation require approval; no writable state is produced.',
  );
  return {
    previewSchemaVersion: 1 as const,
    targetSaveSchemaVersion: 2 as const,
    sourceSha256: createHash('sha256').update(JSON.stringify(original)).digest('hex'),
    status: 'review-required' as const,
    productionWritesEnabled: false as const,
    original,
    mappings,
    flags,
  };
}
