/** Canonical minor unit for physical mining: 0.01 cSCU. */
export const MINOR_PER_CSCU = 100;
export const MINOR_PER_SCU = 10_000;

export function wholeCscuToMinor(cscu: number): number {
  if (!Number.isSafeInteger(cscu) || cscu < 0) throw new RangeError('Invalid whole cSCU quantity.');
  const minor = cscu * MINOR_PER_CSCU;
  if (!Number.isSafeInteger(minor)) throw new RangeError('Mineral quantity exceeds safe integer range.');
  return minor;
}

export function minorToWholeAndRemainder(minor: number): { whole: number; remainder: number } {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError('Invalid mineral quantity.');
  return { whole: Math.floor(minor / MINOR_PER_CSCU), remainder: minor % MINOR_PER_CSCU };
}

export function formatCscuMinor(minor: number): string {
  const { whole, remainder } = minorToWholeAndRemainder(minor);
  return remainder === 0 ? String(whole) : `${whole}.${String(remainder).padStart(2, '0').replace(/0$/, '')}`;
}

export function formatScuMinor(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new RangeError('Invalid mineral quantity.');
  const whole = Math.floor(minor / MINOR_PER_SCU);
  const remainder = minor % MINOR_PER_SCU;
  return remainder === 0
    ? String(whole)
    : `${whole}.${String(remainder).padStart(4, '0').replace(/0+$/, '')}`;
}

export function parseCscuMinor(text: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]) * MINOR_PER_CSCU + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

/** DIME catalog prices are aUEC per SCU; products are 1/10000 aUEC units. */
export function saleValueNumerator(minor: number, pricePerScu: number): bigint {
  if (!Number.isSafeInteger(minor) || minor < 0 || !Number.isSafeInteger(pricePerScu) || pricePerScu < 0)
    throw new RangeError('Invalid sale quantity or price.');
  return BigInt(minor) * BigInt(pricePerScu);
}

function safeCurrency(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError('Sale credit exceeds safe integer range.');
  return result;
}

/** Legacy-compatible nearest-aUEC quote for a single sale. */
export function saleProceeds(minor: number, pricePerScu: number): number {
  return safeCurrency((saleValueNumerator(minor, pricePerScu) + 5000n) / BigInt(MINOR_PER_SCU));
}

/**
 * Settle fractional prices without changing total value when stacks are split.
 * The signed remainder is exact value minus already-credited whole aUEC.
 */
export function settleSale(
  minor: number,
  pricePerScu: number,
  previousRemainder: number,
): { credit: number; remainder: number } {
  if (!Number.isSafeInteger(previousRemainder) || previousRemainder < -5000 || previousRemainder >= 5000)
    throw new RangeError('Invalid currency remainder.');
  const exact = saleValueNumerator(minor, pricePerScu) + BigInt(previousRemainder);
  // BigInt truncates toward zero; add a positive multiple before division.
  const credit = (exact + 15000n) / BigInt(MINOR_PER_SCU) - 1n;
  const remainder = exact - credit * BigInt(MINOR_PER_SCU);
  return { credit: safeCurrency(credit), remainder: safeCurrency(remainder) };
}

export function exactMinorSum(values: readonly number[]): number {
  return values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError('Invalid ground piece.');
    const next = sum + value;
    if (!Number.isSafeInteger(next)) throw new RangeError('Ground yield exceeds safe integer range.');
    return next;
  }, 0);
}
