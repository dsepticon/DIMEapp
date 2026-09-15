import { createHmac, timingSafeEqual } from 'node:crypto';

export const CONVERSION_MODES = ['DISABLED', 'TESTERS', 'ENABLED'] as const;
export type ConversionMode = (typeof CONVERSION_MODES)[number];

export type ConversionGate = Readonly<{
  mode: ConversionMode;
  testerCount: number;
  permits(player: string): boolean;
}>;

export const MAX_CONVERSION_TESTER_TAGS = 20;
export const MAX_CONVERSION_TESTER_ENV_LENGTH = 2048;
const TAG_PATTERN = /^[a-f0-9]{64}$/;

export function conversionTesterTag(player: string, identityKey: Uint8Array): string {
  return createHmac('sha256', identityKey).update(`dime:v4:conversion-tester:${player}`).digest('hex');
}

/** Both operands are validated before the fixed-length constant-time comparison. */
export function constantTimeTagMatch(candidate: string, configured: string): boolean {
  if (!TAG_PATTERN.test(candidate) || !TAG_PATTERN.test(configured)) return false;
  return timingSafeEqual(Buffer.from(candidate, 'ascii'), Buffer.from(configured, 'ascii'));
}

export function createConversionGate(
  modeValue: string,
  testerTagsValue: string,
  identityKey: Uint8Array,
): ConversionGate {
  if (!CONVERSION_MODES.includes(modeValue as ConversionMode)) throw new Error('invalid_conversion_mode');
  const mode = modeValue as ConversionMode;
  if (testerTagsValue.length > MAX_CONVERSION_TESTER_ENV_LENGTH)
    throw new Error('invalid_conversion_testers');
  const entries = testerTagsValue.split(',').filter((tag) => tag.length > 0);
  if (entries.some((tag) => !TAG_PATTERN.test(tag))) throw new Error('invalid_conversion_testers');
  const tags = [...new Set(entries)];
  if (tags.length > MAX_CONVERSION_TESTER_TAGS) throw new Error('invalid_conversion_testers');
  return {
    mode,
    testerCount: tags.length,
    permits(player) {
      if (mode === 'ENABLED') return true;
      if (mode === 'DISABLED') return false;
      const candidate = conversionTesterTag(player, identityKey);
      return tags.some((tag) => constantTimeTagMatch(candidate, tag));
    },
  };
}

export const disabledConversionGate: ConversionGate = Object.freeze({
  mode: 'DISABLED',
  testerCount: 0,
  permits: () => false,
});
