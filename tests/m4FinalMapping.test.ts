import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import mapping from '../docs/dime-m4-final-mapping.json';
import {
  CAPACITIES,
  EQUIPMENT,
  METHOD_NAMES,
  METHODS,
  MINERAL_CATALOG,
  ORE_NAMES,
  ORES,
  SHIP_NAMES,
  SHIP_PRICES,
  TRAVEL,
} from '../shared/catalog';
import { BASIC_MINING_TOOL } from '../shared/miningTool';
import { ORIGINAL_CONTENT } from '../shared/originalCatalog';
import { ZONE_IDS, ZONES } from '../shared/world';

const signature = (stats: unknown) => createHash('sha256').update(JSON.stringify(stats)).digest('hex');
const realWorldMaterials = [
  'Garnet',
  'Fluorite',
  'Spinel',
  'Alexandrite',
  'Molybdenite',
  'Bauxite',
  'Beryl',
  'Scheelite',
  'Borax',
  'Chalcopyrite',
  'Corundum',
  'Native Gold',
  'Chromite',
  'Hematite',
  'Sphalerite',
  'Native Platinum',
  'Quartz',
  'Cassiterite',
  'Ilmenite',
  'Wolframite',
];
const allRows = [
  ...mapping.locations,
  ...mapping.zones,
  ...mapping.minerals,
  ...mapping.shipsAndVehicles,
  ...mapping.equipment,
  ...mapping.refineryMethods,
];

describe('explicit original-universe equivalence matrix', () => {
  it('covers each source asset once, with distinct stable original identifiers', () => {
    expect(mapping.minerals.map((row) => row.legacyIdentifier)).toEqual([...ORE_NAMES]);
    expect(mapping.shipsAndVehicles.map((row) => row.legacyIdentifier)).toEqual([...SHIP_NAMES]);
    expect(mapping.refineryMethods.map((row) => row.legacyIdentifier)).toEqual([...METHOD_NAMES]);
    expect(mapping.zones.map((row) => row.legacyIdentifier)).toEqual([...ZONE_IDS]);
    expect(mapping.equipment.map((row) => row.legacyIdentifier).sort()).toEqual(
      ['Hand mining tool', ...Object.keys(EQUIPMENT), 'Arbor MH1', 'Arbor MH2'].sort(),
    );
    expect(new Set(allRows.map((row) => row.originalStableIdentifier)).size).toBe(allRows.length);
    expect(allRows.every((row) => row.conversionClassification === 'EXACT_FUNCTIONAL_EQUIVALENT')).toBe(true);
    expect(allRows.every((row) => row.migrationVersion === 1)).toBe(true);
    expect(allRows.every((row) => row.reversalMapping === row.legacyIdentifier)).toBe(true);
    expect(mapping.extractionClasses.map((row) => row.originalStableIdentifier)).toEqual([
      'extract.x001',
      'extract.x002',
      'extract.x003',
      'extract.x004',
    ]);
    expect(mapping.characters).toHaveLength(3);
    expect(mapping.questTerminology).toHaveLength(2);
    expect(mapping.materialDisclaimer).toContain('fictional game rules');
  });

  it('binds each mineral to its full source signature, not a list position', () => {
    expect(mapping.minerals.map((row) => row.originalDisplayName)).toEqual(realWorldMaterials);
    expect(new Set(realWorldMaterials).size).toBe(20);
    for (const row of mapping.minerals) {
      const legacy = row.legacyIdentifier;
      const raw = MINERAL_CATALOG.find(
        (entry) => entry.displayName === legacy && entry.category !== 'REFINED_MATERIAL',
      );
      expect(raw).toBeDefined();
      expect(row.category).toBe(raw?.category);
      expect(row.sourceStats).toEqual({
        rawPricePerScu: ORES[legacy].raw,
        processedPricePerScu: ORES[legacy].refined,
        spawnWeights: raw?.spawnWeights,
        extractionClasses: raw?.extractionClasses,
        cargoContainers: raw?.validCargoContainers,
        refinable: raw?.refineryEligible,
        rawSale: raw?.rawSaleEligible,
        quantityUnit: '0.01 cSCU',
      });
      expect(row.sourceStatSignature).toBe(signature(row.sourceStats));
      expect(row.processedStableIdentifier === null).toBe(ORES[legacy].gem);
      const original = ORIGINAL_CONTENT.minerals.find(
        (mineral) => mineral.id === row.originalStableIdentifier,
      );
      expect(original).toBeDefined();
      expect(original?.name).toBe(row.originalDisplayName);
      expect(original?.rawPricePerScu).toBe(row.sourceStats.rawPricePerScu);
      expect(original?.processedPricePerScu).toBe(row.sourceStats.processedPricePerScu);
      expect(original?.refinable).toBe(row.sourceStats.refinable);
      expect(original?.rawSale).toBe(row.sourceStats.rawSale);
      expect(original?.category).toBe(row.category);
    }
    expect(ORIGINAL_CONTENT.materialDisclaimer).toBe(mapping.materialDisclaimer);
  });

  it('preserves every ship, vehicle, crew and process statistic', () => {
    for (const row of mapping.shipsAndVehicles) {
      const legacy = row.legacyIdentifier;
      expect(row.sourceStats.capacityCscu).toBe(CAPACITIES[legacy] ?? null);
      expect(row.sourceStats.price).toBe(SHIP_PRICES[legacy] ?? null);
      expect(row.sourceStats.travelSeconds).toBe(TRAVEL[legacy] ?? null);
      expect(row.sourceStatSignature).toBe(signature(row.sourceStats));
    }
    for (const row of mapping.equipment) {
      const legacy = row.legacyIdentifier;
      expect(row.sourceStats.price).toBe(EQUIPMENT[legacy as keyof typeof EQUIPMENT] ?? null);
      if (legacy === BASIC_MINING_TOOL.id) expect(row.sourceStats.toolStats).toEqual(BASIC_MINING_TOOL);
      if (['Terraphon', 'Andirr', 'Dora'].includes(legacy)) {
        expect(row.sourceStats.slot).toBe('CREW');
        expect(row.sourceStats.compatibleWith).toBe('Mole');
      }
      expect(row.sourceStatSignature).toBe(signature(row.sourceStats));
    }
    for (const row of mapping.refineryMethods) {
      expect(row.sourceStats.profile).toEqual(METHODS[row.legacyIdentifier as keyof typeof METHODS]);
      expect(row.sourceStatSignature).toBe(signature(row.sourceStats));
    }
  });

  it('retains each zone’s size, services, spawn and paired exits', () => {
    for (const row of mapping.zones) {
      const source = ZONES[row.legacyIdentifier as keyof typeof ZONES];
      expect(row.sourceStats.width).toBe(source.width);
      expect(row.sourceStats.height).toBe(source.height);
      expect(row.sourceStats.spawn).toEqual(source.spawn);
      expect(row.sourceStats.objectKinds).toEqual(source.objects.map((item) => item.kind));
      expect(row.sourceStats.exits).toEqual(source.exits.map((item) => ({ to: item.to, entry: item.entry })));
      expect(row.sourceStatSignature).toBe(signature(row.sourceStats));
    }
  });
});
