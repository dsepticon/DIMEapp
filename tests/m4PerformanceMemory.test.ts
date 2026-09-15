import { describe, expect, it } from 'vitest';
import { classifyHeapMeasurements } from '../shared/performanceMemory';

describe('production performance heap evidence', () => {
  it('marks an unavailable API explicitly', () => {
    expect(classifyHeapMeasurements([null, undefined])).toEqual({
      available: false,
      method: 'unavailable',
      reason: 'api-unavailable',
      values: [null, null],
    });
  });

  it('never reports Chromium fixed placeholder values as measured heap', () => {
    expect(classifyHeapMeasurements([10_000_000, 10_000_000])).toEqual({
      available: false,
      method: 'unavailable',
      reason: 'fixed-sentinel',
      values: [null, null],
    });
  });

  it('retains supported precise measurements without rounding', () => {
    expect(classifyHeapMeasurements([12_345_678, 12_456_789])).toEqual({
      available: true,
      method: 'performance.memory.usedJSHeapSize',
      values: [12_345_678, 12_456_789],
    });
  });
});
