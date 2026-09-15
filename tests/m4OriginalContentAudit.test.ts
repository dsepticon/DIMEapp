import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const originalModules = [
  'shared/originalCatalog.ts',
  'shared/originalGame.ts',
  'shared/originalSchema.ts',
  'shared/originalMining.ts',
  'shared/originalSpatial.ts',
  'shared/originalWorld.ts',
  'server/contentConversion.ts',
  'server/contentDynamo.ts',
  'server/originalApi.ts',
  'server/originalMiningService.ts',
  'server/originalReset.ts',
];
const protectedTerms = [
  'Star Citizen',
  'ARC-L1',
  'Lyria',
  'Wala',
  'Area18',
  'Area-18',
  'Aaron Halo',
  'aUEC',
  'Dolivine',
  'Aphorite',
  'Hadanite',
  'Janalite',
  'Nomad',
  'Prospector',
  'Mole',
  'Greycat',
  'MISC',
  'ARGO',
  'Mara Voss',
  'Ivo Sen',
  'Neri Vale',
  'First Shift',
];

describe('original production module content boundary', () => {
  it('contains no protected legacy display terms or identifiers', () => {
    for (const file of originalModules) {
      const text = readFileSync(file, 'utf8');
      for (const term of protectedTerms) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(text, `${term} in ${file}`).not.toMatch(new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`));
      }
    }
  });

  it('keeps protected aliases in the isolated conversion module only', () => {
    const conversion = readFileSync('server/legacyContentConversion.ts', 'utf8');
    expect(conversion).toContain('Isolated aliases for the version-2 save');
    expect(conversion).not.toMatch(/console\.|logger|JSON\.stringify\(source\)/);
  });
});
