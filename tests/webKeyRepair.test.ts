import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { requireDistinctKeys, webKey, WebInitializationError } from '../server/webInitialization';

it('independent normalized keys pass and decoded reused bytes fail with KEY_REUSE', () => {
  const a = randomBytes(32),
    b = randomBytes(32);
  expect(() =>
    requireDistinctKeys([webKey(a.toString('base64')), webKey(b.toString('base64'))]),
  ).not.toThrow();
  try {
    requireDistinctKeys([a, Uint8Array.from(a)]);
    throw Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(WebInitializationError);
    expect((error as WebInitializationError).category).toBe('KEY_REUSE');
  }
});
it('format, length and reuse failures remain separate', () => {
  for (const [text, category] of [
    ['not base64\n', 'SECRET_FORMAT'],
    [Buffer.alloc(31).toString('base64'), 'KEY_LENGTH'],
  ]) {
    try {
      webKey(text);
      throw Error('expected rejection');
    } catch (error) {
      expect((error as WebInitializationError).category).toBe(category);
    }
  }
});
