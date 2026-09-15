export type HeapMeasurement = Readonly<{
  available: boolean;
  method: 'performance.memory.usedJSHeapSize' | 'unavailable';
  reason?: 'api-unavailable' | 'fixed-sentinel';
  values: Array<number | null>;
}>;

const CHROMIUM_PLACEHOLDER_BYTES = 10_000_000;

/** Reject Chromium's fixed placeholder rather than presenting it as measured heap evidence. */
export function classifyHeapMeasurements(raw: Array<number | null | undefined>): HeapMeasurement {
  const finite = raw.map((value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null,
  );
  if (finite.every((value) => value === null))
    return { available: false, method: 'unavailable', reason: 'api-unavailable', values: finite };
  const measured = finite.filter((value): value is number => value !== null);
  if (measured.length > 0 && measured.every((value) => value === CHROMIUM_PLACEHOLDER_BYTES))
    return {
      available: false,
      method: 'unavailable',
      reason: 'fixed-sentinel',
      values: finite.map(() => null),
    };
  return { available: true, method: 'performance.memory.usedJSHeapSize', values: finite };
}
