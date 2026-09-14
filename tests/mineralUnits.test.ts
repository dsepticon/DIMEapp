import { describe, expect, it } from 'vitest';
import {
  formatCscuMinor,
  minorToWholeAndRemainder,
  saleProceeds,
  saleValueNumerator,
  settleSale,
  wholeCscuToMinor,
} from '../shared/mineralUnits';
import { rawMineral } from '../shared/catalog';
import { fracturePieces, generatedNodes } from '../shared/miningWorld';
import { ZONES } from '../shared/world';
import { initialState } from '../shared/game';

describe('fractional cSCU accounting', () => {
  it('converts whole legacy quantities without reinterpreting their values', () => {
    expect(wholeCscuToMinor(4)).toBe(400);
    expect(minorToWholeAndRemainder(125)).toEqual({ whole: 1, remainder: 25 });
    expect(formatCscuMinor(125)).toBe('1.25');
    expect(formatCscuMinor(150)).toBe('1.5');
    expect(formatCscuMinor(400)).toBe('4');
    expect(formatCscuMinor(5)).toBe('0.05');
    const oldSave = initialState(() => 0.5);
    oldSave.mining.Hand.Dolivine = 4;
    oldSave.world!.minorRemainders = { Hand: { Dolivine: 25 } };
    expect(oldSave.mining.Hand.Dolivine).toBe(4);
    expect(
      formatCscuMinor(
        wholeCscuToMinor(oldSave.mining.Hand.Dolivine) + oldSave.world!.minorRemainders.Hand!.Dolivine!,
      ),
    ).toBe('4.25');
  });

  it('prices the exact 400-unit tutorial total once at the unchanged catalog price', () => {
    expect(saleProceeds(125 + 125 + 150, rawMineral('Dolivine').pricePerScu)).toBe(5_200);
    expect(saleProceeds(400, rawMineral('Dolivine').pricePerScu) + 500).toBe(5_700);
  });

  it('settles split fractional stacks to the same aUEC and carry as one combined stack', () => {
    const price = rawMineral('Agricium').pricePerScu;
    const combined = settleSale(101, price, 0);
    let credit = 0;
    let remainder = 0;
    for (const units of [1, 25, 25, 50]) {
      const part = settleSale(units, price, remainder);
      credit += part.credit;
      remainder = part.remainder;
    }
    expect({ credit, remainder }).toEqual(combined);
    expect(saleValueNumerator(101, price)).toBe(109585n);
    expect(combined.credit).toBe(saleProceeds(101, price));
    expect(settleSale(1, price, 0)).toEqual({ credit: 0, remainder: 1085 });
  });

  it('keeps small nodes fractional and large nodes within the piece budget', () => {
    const hand = ZONES.LYRIA_CAVE_01;
    let small = undefined;
    for (let i = 0; i < 100 && !small; i++)
      small = generatedNodes(`synthetic-fractional-${i}`, hand).find((node) => node.yieldUnits < 100);
    expect(small).toBeDefined();
    const smallPieces = fracturePieces(small!, hand);
    expect(smallPieces.length).toBeGreaterThanOrEqual(3);
    expect(smallPieces.reduce((sum, piece) => sum + piece.units, 0)).toBe(small!.yieldUnits);
    const roc = ZONES.WALA_SURFACE_02;
    const large = generatedNodes('synthetic-large', roc).sort((a, b) => b.yieldUnits - a.yieldUnits)[0];
    const largePieces = fracturePieces(large, roc);
    expect(largePieces.length).toBeLessThanOrEqual(6);
    expect(largePieces.length).toBeGreaterThanOrEqual(3);
    expect(new Set(largePieces.map((piece) => `${piece.x},${piece.y}`)).size).toBe(largePieces.length);
    expect(largePieces.reduce((sum, piece) => sum + piece.units, 0)).toBe(large.yieldUnits);
  });
});
