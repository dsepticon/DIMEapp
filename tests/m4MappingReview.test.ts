import { describe, expect, it } from 'vitest';
import mapping from '../docs/dime-m4-semantic-mapping-review.json';
import inventory from '../docs/dime-m4-replacement-inventory.json';
import {
  CAPACITIES,
  EQUIPMENT,
  METHOD_NAMES,
  ORE_NAMES,
  ORES,
  SHIP_NAMES,
  SHIP_PRICES,
} from '../shared/catalog';
import { ZONE_IDS } from '../shared/world';

describe('Milestone 4 semantic mapping review gate', () => {
  it('covers every catalog asset and world zone before conversion', () => {
    expect(mapping.minerals.map((item) => item.source)).toEqual([...ORE_NAMES]);
    expect(mapping.ships.map((item) => item.source)).toEqual([...SHIP_NAMES]);
    expect(mapping.equipment.map((item) => item.source).sort()).toEqual(
      Object.keys(inventory.equipmentAndModifiers).sort(),
    );
    expect(mapping.methods.map((item) => item.source)).toEqual([...METHOD_NAMES]);
    expect(mapping.zones.map((item) => item.source)).toEqual([...ZONE_IDS]);
    expect(mapping.extractionClasses.map((item) => item.source).sort()).toEqual(
      Object.keys(inventory.extractionClasses).sort(),
    );
    expect(mapping.other.map((item) => item.source).sort()).toEqual(Object.keys(inventory.otherTerms).sort());
  });

  it('records current prices, capacities and refinery classes without changing them', () => {
    for (const item of mapping.minerals) {
      const value = ORES[item.source];
      expect(item.rawValuePerScu).toBe(value.raw);
      expect(item.processedValuePerScu).toBe(value.refined);
      expect(item.refinable).toBe(!value.gem);
    }
    for (const item of mapping.ships) {
      expect(item.capacityCscu).toBe(CAPACITIES[item.source] ?? null);
      expect(item.purchaseOrSaleValue).toBe(SHIP_PRICES[item.source] ?? null);
    }
    for (const item of mapping.equipment) {
      expect(item.purchaseOrSaleValue).toBe((EQUIPMENT as Record<string, number>)[item.source] ?? null);
    }
  });

  it('cannot be mistaken for an approved save conversion', () => {
    const all = [
      ...mapping.minerals,
      ...mapping.ships,
      ...mapping.equipment,
      ...mapping.extractionClasses,
      ...mapping.methods,
      ...mapping.zones,
      ...mapping.other,
    ];
    expect(all.every((item) => item.conversion === 'SUPERSEDED_BY_EXPLICIT_FUNCTIONAL_MATRIX')).toBe(true);
    expect(all.every((item) => item.proposedSaveId === null)).toBe(true);
  });
});
