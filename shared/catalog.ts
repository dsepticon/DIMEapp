// Catalog values recovered from the active October 2024 frontend; see docs/recovery-provenance.json.
export const ORE_NAMES = [
  'Dolivine',
  'Aphorite',
  'Hadanite',
  'Janalite',
  'Agricium',
  'Aluminium',
  'Beryl',
  'Bexalite',
  'Borase',
  'Copper',
  'Corundum',
  'Gold',
  'Hephaestanite',
  'Iron',
  'Laranite',
  'Quantanium',
  'Quartz',
  'Taranite',
  'Titanium',
  'Tungsten',
] as const;
export const SHIP_NAMES = [
  'Nomad',
  'Roc',
  'Prospector',
  'Mole',
  'Cutlass Black',
  'Hull A',
  'Freelancer',
  'RAFT',
  'Constellation Andromeda',
  'Mercury Starrunner',
  'Freelancer MAX',
  'Constellation Taurus',
  'Caterpillar',
  'C2 Hercules Starlifter',
] as const;
export const MINING_TYPES = ['Hand', 'Roc', 'Prospector', 'Mole'] as const;
export const LOCATIONS = ['ARC-L1', 'Area-18', 'Lyria', 'Wala', 'Halo'] as const;
export const METHOD_NAMES = [
  'Cormack Method',
  'Dinyx Solventation',
  'Electrostarolysis',
  'Ferron Exchange',
  'Gaskin Process',
  'Kazen Winnowing',
  'Pyrometric Cromalysis',
  'Thermonatic Deposition',
  'XCR Reaction',
] as const;
export const EQUIPMENT = {
  'Hofstede S1': 12750,
  'Impact I': 57750,
  'Helix I': 108000,
  'Hofstede S2': 12750,
  'Impact II': 57750,
  'Helix II': 108000,
  Terraphon: 250000,
  Andirr: 250000,
  Dora: 500000,
} as const;
export const SHIP_PRICES: Record<string, number> = {
  Roc: 103950,
  Prospector: 2929500,
  Mole: 8930250,
  'Cutlass Black': 2116800,
  'Hull A': 1701000,
  Freelancer: 3118500,
  RAFT: 3543750,
  'Constellation Andromeda': 10160640,
  'Mercury Starrunner': 12285000,
  'Freelancer MAX': 4252500,
  'Constellation Taurus': 8043840,
  Caterpillar: 12474000,
  'C2 Hercules Starlifter': 18900000,
};
export const CAPACITIES: Record<string, number> = {
  Hand: 12,
  Roc: 80,
  Prospector: 3200,
  Mole: 9600,
  Nomad: 2400,
  'Cutlass Black': 4600,
  'Hull A': 6400,
  Freelancer: 6600,
  RAFT: 9600,
  'Constellation Andromeda': 9600,
  'Mercury Starrunner': 11400,
  'Freelancer MAX': 12000,
  'Constellation Taurus': 17400,
  Caterpillar: 57600,
  'C2 Hercules Starlifter': 69600,
};
export const ORES: Record<string, { raw: number; refined: number; gem: boolean }> = {
  Dolivine: { raw: 130000, refined: 0, gem: true },
  Aphorite: { raw: 152500, refined: 0, gem: true },
  Hadanite: { raw: 275000, refined: 0, gem: true },
  Janalite: { raw: 17640000, refined: 0, gem: true },
  Agricium: { raw: 1085, refined: 2833, gem: false },
  Aluminium: { raw: 133, refined: 349, gem: false },
  Beryl: { raw: 1149, refined: 2817, gem: false },
  Bexalite: { raw: 3080, refined: 7983, gem: false },
  Borase: { raw: 1416, refined: 3634, gem: false },
  Copper: { raw: 153, refined: 408, gem: false },
  Corundum: { raw: 158, refined: 389, gem: false },
  Gold: { raw: 3211, refined: 8099, gem: false },
  Hephaestanite: { raw: 1122, refined: 2830, gem: false },
  Iron: { raw: 161, refined: 407, gem: false },
  Laranite: { raw: 1173, refined: 3115, gem: false },
  Quantanium: { raw: 10118, refined: 25153, gem: false },
  Quartz: { raw: 160, refined: 416, gem: false },
  Taranite: { raw: 3118, refined: 7840, gem: false },
  Titanium: { raw: 194, refined: 517, gem: false },
  Tungsten: { raw: 172, refined: 431, gem: false },
};
// These are the existing hand/ROC roll intervals from miningReward, now named so rarity is inspectable.
export const GEM_SPAWN_WEIGHTS = {
  Hand: { Dolivine: 0.5, Aphorite: 0.3, Hadanite: 0.19, Janalite: 0.01 },
  Roc: { Dolivine: 0.5, Aphorite: 0.3, Hadanite: 0.2, Janalite: 0 },
} as const;
export const ASTEROIDS = {
  'E-Type': [
    { ore: 'Aluminium', weight: 0.4444 },
    { ore: 'Beryl', weight: 0.2667 },
    { ore: 'Bexalite', weight: 0.0976 },
    { ore: 'Copper', weight: 0.4878 },
    { ore: 'Corundum', weight: 0.4717 },
    { ore: 'Gold', weight: 0.2222 },
    { ore: 'Iron', weight: 0.4444 },
    { ore: 'Quantanium', weight: 0.0566 },
    { ore: 'Quartz', weight: 0.4255 },
    { ore: 'Taranite', weight: 0.0943 },
    { ore: 'Titanium', weight: 0.4717 },
    { ore: 'Tungsten', weight: 0.4444 },
  ],
  'P-Type': [
    { ore: 'Aluminium', weight: 0.3623 },
    { ore: 'Bexalite', weight: 0.2033 },
    { ore: 'Copper', weight: 0.3623 },
    { ore: 'Corundum', weight: 0.3623 },
    { ore: 'Gold', weight: 0.0431 },
    { ore: 'Iron', weight: 0.4065 },
    { ore: 'Laranite', weight: 0.3125 },
    { ore: 'Quantanium', weight: 0.0517 },
    { ore: 'Quartz', weight: 0.431 },
    { ore: 'Taranite', weight: 0.1984 },
    { ore: 'Titanium', weight: 0.3906 },
    { ore: 'Tungsten', weight: 0.3968 },
  ],
  'S-Type': [
    { ore: 'Aluminium', weight: 0.289 },
    { ore: 'Beryl', weight: 0.241 },
    { ore: 'Bexalite', weight: 0.1689 },
    { ore: 'Copper', weight: 0.3012 },
    { ore: 'Corundum', weight: 0.3012 },
    { ore: 'Gold', weight: 0.0685 },
    { ore: 'Iron', weight: 0.3378 },
    { ore: 'Laranite', weight: 0.2454 },
    { ore: 'Quantanium', weight: 0.0411 },
    { ore: 'Quartz', weight: 0.3425 },
    { ore: 'Taranite', weight: 0.1634 },
    { ore: 'Titanium', weight: 0.3268 },
    { ore: 'Tungsten', weight: 0.3067 },
  ],
  'Q-Type': [
    { ore: 'Aluminium', weight: 0.3676 },
    { ore: 'Bexalite', weight: 0.1145 },
    { ore: 'Borase', weight: 0.2206 },
    { ore: 'Copper', weight: 0.3584 },
    { ore: 'Corundum', weight: 0.3584 },
    { ore: 'Gold', weight: 0.1145 },
    { ore: 'Iron', weight: 0.3817 },
    { ore: 'Laranite', weight: 0.1527 },
    { ore: 'Quantanium', weight: 0.0458 },
    { ore: 'Quartz', weight: 0.3584 },
    { ore: 'Taranite', weight: 0.1075 },
    { ore: 'Titanium', weight: 0.3817 },
    { ore: 'Tungsten', weight: 0.3584 },
  ],
  'M-Type': [
    { ore: 'Agricium', weight: 0.3404 },
    { ore: 'Aluminium', weight: 0.3922 },
    { ore: 'Bexalite', weight: 0.0426 },
    { ore: 'Copper', weight: 0.5051 },
    { ore: 'Corundum', weight: 0.3891 },
    { ore: 'Gold', weight: 0.1961 },
    { ore: 'Iron', weight: 0.3922 },
    { ore: 'Quantanium', weight: 0.0385 },
    { ore: 'Quartz', weight: 0.4255 },
    { ore: 'Taranite', weight: 0.0755 },
    { ore: 'Titanium', weight: 0.3774 },
    { ore: 'Tungsten', weight: 0.3846 },
  ],
  'C-Type': [
    { ore: 'Aluminium', weight: 0.3968 },
    { ore: 'Bexalite', weight: 0.2024 },
    { ore: 'Copper', weight: 0.3891 },
    { ore: 'Corundum', weight: 0.361 },
    { ore: 'Gold', weight: 0.0844 },
    { ore: 'Hephaestanite', weight: 0.2888 },
    { ore: 'Iron', weight: 0.3546 },
    { ore: 'Quantanium', weight: 0.0476 },
    { ore: 'Quartz', weight: 0.4219 },
    { ore: 'Taranite', weight: 0.1984 },
    { ore: 'Titanium', weight: 0.4049 },
    { ore: 'Tungsten', weight: 0.361 },
  ],
};
export type MineralCategory = 'GEM' | 'ORE' | 'REFINED_MATERIAL';
export type ExtractionClass = 'HAND' | 'ROC' | 'SHIP';
export type CargoContainer = 'HAND_HOLD' | 'ROC_HOLD' | 'SHIP_MINING_HOLD' | 'CARGO_SHIP';
export type MineralStatus = 'VERIFIED' | 'CODE_DERIVED' | 'NEEDS_OWNER_REVIEW';
export interface MineralRecord {
  id: string;
  displayName: string;
  category: MineralCategory;
  extractionClasses: readonly ExtractionClass[];
  validCargoContainers: readonly CargoContainer[];
  spawnWeights: Readonly<Record<string, number>>;
  pricePerScu: number;
  refineryEligible: boolean;
  rawSaleEligible: boolean;
  refinedOutput: string | null;
  knownDimeLocations: readonly (typeof LOCATIONS)[number][];
  status: MineralStatus;
}
const asteroidWeights = (name: string): Record<string, number> =>
  Object.fromEntries(
    Object.entries(ASTEROIDS).flatMap(([pool, entries]) => {
      const entry = entries.find((item) => item.ore === name);
      return entry ? [[pool, entry.weight]] : [];
    }),
  );
export const MINERAL_CATALOG: readonly MineralRecord[] = ORE_NAMES.flatMap((name): MineralRecord[] => {
  const value = ORES[name];
  const id = name.toLowerCase();
  if (value.gem) {
    return [
      {
        id,
        displayName: name,
        category: 'GEM',
        extractionClasses:
          GEM_SPAWN_WEIGHTS.Roc[name as keyof typeof GEM_SPAWN_WEIGHTS.Roc] > 0 ? ['HAND', 'ROC'] : ['HAND'],
        validCargoContainers: ['HAND_HOLD', 'ROC_HOLD', 'CARGO_SHIP'],
        spawnWeights: {
          Hand: GEM_SPAWN_WEIGHTS.Hand[name as keyof typeof GEM_SPAWN_WEIGHTS.Hand],
          Roc: GEM_SPAWN_WEIGHTS.Roc[name as keyof typeof GEM_SPAWN_WEIGHTS.Roc],
        },
        pricePerScu: value.raw,
        refineryEligible: false,
        rawSaleEligible: true,
        refinedOutput: null,
        knownDimeLocations: ['Lyria', 'Wala', 'Area-18'],
        status: 'VERIFIED',
      },
    ];
  }
  const raw: MineralRecord = {
    id: `${id}-raw`,
    displayName: name,
    category: 'ORE',
    extractionClasses: ['SHIP'],
    validCargoContainers: ['SHIP_MINING_HOLD', 'CARGO_SHIP'],
    spawnWeights: asteroidWeights(name),
    pricePerScu: value.raw,
    refineryEligible: true,
    rawSaleEligible: true,
    refinedOutput: `${id}-refined`,
    knownDimeLocations: ['Halo', 'ARC-L1'],
    status: 'NEEDS_OWNER_REVIEW',
  };
  const refined: MineralRecord = {
    id: `${id}-refined`,
    displayName: `Refined ${name}`,
    category: 'REFINED_MATERIAL',
    extractionClasses: [],
    validCargoContainers: ['CARGO_SHIP'],
    spawnWeights: {},
    pricePerScu: value.refined,
    refineryEligible: false,
    rawSaleEligible: false,
    refinedOutput: null,
    knownDimeLocations: ['ARC-L1', 'Area-18'],
    status: 'NEEDS_OWNER_REVIEW',
  };
  return [raw, refined];
});
export const mineralById = (id: string): MineralRecord | undefined =>
  MINERAL_CATALOG.find((material) => material.id === id);
export const rawMineral = (name: (typeof ORE_NAMES)[number]): MineralRecord =>
  mineralById(ORES[name].gem ? name.toLowerCase() : `${name.toLowerCase()}-raw`)!;
export const refinedMineral = (name: (typeof ORE_NAMES)[number]): MineralRecord | undefined =>
  mineralById(`${name.toLowerCase()}-refined`);
export const METHODS = {
  'Cormack Method': { yield: 'Low', cost: 'Medium', time: 'Short' },
  'Dinyx Solventation': { yield: 'High', cost: 'Low', time: 'Long' },
  Electrostarolysis: { yield: 'Medium', cost: 'Medium', time: 'Short' },
  'Ferron Exchange': { yield: 'High', cost: 'Medium', time: 'Long' },
  'Gaskin Process': { yield: 'Medium', cost: 'High', time: 'Short' },
  'Kazen Winnowing': { yield: 'Low', cost: 'Low', time: 'Short' },
  'Pyrometric Cromalysis': { yield: 'High', cost: 'High', time: 'Short' },
  'Thermonatic Deposition': { yield: 'Medium', cost: 'Low', time: 'Medium' },
  'XCR Reaction': { yield: 'Low', cost: 'High', time: 'Long' },
} as const;
export const TRAVEL: Record<string, number> = {
  Nomad: 40,
  'Cutlass Black': 35,
  'Mercury Starrunner': 35,
  Freelancer: 40,
  'Freelancer MAX': 45,
  'Constellation Andromeda': 47,
  'Constellation Taurus': 50,
  'Hull A': 55,
  'C2 Hercules Starlifter': 57,
  RAFT: 57,
  Caterpillar: 60,
  Prospector: 55,
  Mole: 55,
};
