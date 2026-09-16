/** Server/owner-tool only. Never log invitations, subjects, nonces or derived tags. */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export const TESTER_INVITATION_SECONDS = 900;
const schema = z
  .object({
    v: z.literal(1),
    exp: z.number().int().positive(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    tester: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type TesterInvitation = z.infer<typeof schema>;
export class InvitationError extends Error {
  constructor() {
    super('Tester access could not be verified.');
  }
}
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function keyFor(key: Uint8Array, purpose: 'signature' | 'subject') {
  if (key.length !== 32) throw new InvitationError();
  return createHmac('sha256', key).update(`dime:web-tester:key:${purpose}:v1\0`).digest();
}
export function testerIdentifier(key: Uint8Array, numericSubject: string) {
  if (!/^[1-9][0-9]{0,19}$/.test(numericSubject)) throw new InvitationError();
  return createHmac('sha256', keyFor(key, 'subject'))
    .update('dime:web-tester:subject:v1\0' + numericSubject)
    .digest('hex');
}
const encode = (p: TesterInvitation) =>
  Buffer.from(JSON.stringify({ v: p.v, exp: p.exp, nonce: p.nonce, tester: p.tester })).toString('base64url');
const sign = (key: Uint8Array, payload: string) =>
  createHmac('sha256', keyFor(key, 'signature'))
    .update('dime:web-tester:invitation:v1\0' + payload)
    .digest('base64url');
export function mintTesterInvitation(key: Uint8Array, subject: string, now = Date.now()) {
  const payload: TesterInvitation = {
    v: 1,
    exp: Math.floor(now / 1000) + TESTER_INVITATION_SECONDS,
    nonce: randomBytes(32).toString('base64url'),
    tester: testerIdentifier(key, subject),
  };
  const encoded = encode(payload);
  return { invitation: encoded + '.' + sign(key, encoded), expiresAt: payload.exp * 1000 };
}
export function verifyTesterInvitation(key: Uint8Array, input: string, now = Date.now()): TesterInvitation {
  try {
    if (!/^[A-Za-z0-9_-]{100,400}\.[A-Za-z0-9_-]{43}$/.test(input)) throw new InvitationError();
    const [payload, signature] = input.split('.') as [string, string];
    if (!constantEqual(sign(key, payload), signature)) throw new InvitationError();
    const value = schema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (
      encode(value) !== payload ||
      value.exp * 1000 <= now ||
      value.exp > Math.floor(now / 1000) + TESTER_INVITATION_SECONDS
    )
      throw new InvitationError();
    return value;
  } catch {
    throw new InvitationError();
  }
}
export const invitationUseKey = (nonce: string) =>
  'tester-use:' +
  createHash('sha256')
    .update('dime:web-tester:nonce:v1\0' + nonce)
    .digest('hex');
