import { randomInt } from 'node:crypto';
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { PAIRING_ALPHABET, type KioskDoc } from '@pass/shared';
import type { Principal } from './auth';
import { newOpaqueId } from './identity';
import { ensureTeacher, refreshRoom, refs, type Ctx } from './room';

// Pairing codes are short-lived and single-use. The kiosk's long-lived
// credential is its Firebase Auth session (custom token -> refresh token).

export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_KIOSK_LABEL = 'Classroom display';

interface PairingCodeDoc { roomId: string; teacherUid: string; expiresAt: Timestamp; createdAt: Timestamp }
const codeRef = (ctx: Ctx, code: string) => ctx.db.doc(`pairingCodes/${code}`) as DocumentReference<PairingCodeDoc>;
const kioskRef = (ctx: Ctx, kioskId: string) => refs(ctx.db).kiosk(kioskId) as DocumentReference<KioskDoc<Timestamp>>;

export function generatePairingCode(length = 6): string {
  return Array.from({ length }, () => PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)]).join('');
}

/** Firestore's ALREADY_EXISTS, as thrown by `create()`. */
const alreadyExists = (e: unknown) => (e as { code?: unknown }).code === 6;

export async function createPairingCode(ctx: Ctx, principal: Principal, generate = generatePairingCode): Promise<{ code: string; expiresAt: number }> {
  const teacher = await ensureTeacher(ctx, principal);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generate();
    const now = ctx.now();
    const expiresAt = now + PAIRING_TTL_MS;
    try {
      await codeRef(ctx, code).create({ roomId: teacher.roomId, teacherUid: principal.uid, expiresAt: Timestamp.fromMillis(expiresAt), createdAt: Timestamp.fromMillis(now) });
      return { code, expiresAt };
    } catch (e) {
      if (!alreadyExists(e)) throw e;
    }
  }
  throw new HttpsError('resource-exhausted', 'Could not make a pairing code. Try again.');
}

export interface KioskAuth {
  createCustomToken(uid: string, claims: Record<string, unknown>): Promise<string>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

export const kioskUid = (kioskId: string) => `kiosk_${kioskId}`;

/** Unauthenticated. Consumes the code and returns a custom token scoped to one room. */
export async function pairKiosk(ctx: Ctx, auth: KioskAuth, input: { code: string; label?: string }): Promise<{ token: string; roomId: string; kioskId: string }> {
  const kioskId = newOpaqueId();
  const roomId = await ctx.db.runTransaction(async (tx) => {
    const ref = codeRef(ctx, input.code);
    const pairing = (await tx.get(ref)).data();
    const nowMs = ctx.now();
    if (!pairing || pairing.expiresAt.toMillis() <= nowMs) throw new HttpsError('not-found', 'That code is not valid. Ask for a new one.');
    const now = Timestamp.fromMillis(nowMs);
    tx.delete(ref);
    tx.create(kioskRef(ctx, kioskId), {
      roomId: pairing.roomId, teacherUid: pairing.teacherUid, label: input.label || DEFAULT_KIOSK_LABEL, pairedAt: now, lastSeenAt: now, revokedAt: null,
    });
    return pairing.roomId;
  });
  const token = await auth.createCustomToken(kioskUid(kioskId), { kiosk: true, kioskId, roomId });
  return { token, roomId, kioskId };
}

/**
 * Rules deny a revoked kiosk on its next read. Touching the display makes open
 * listeners re-evaluate right away, so the kiosk drops to its pairing screen.
 */
export async function revokeKiosk(ctx: Ctx, auth: KioskAuth, uid: string, input: { kioskId: string }): Promise<{ ok: true }> {
  await ctx.db.runTransaction(async (tx) => {
    const kiosk = (await tx.get(kioskRef(ctx, input.kioskId))).data();
    if (!kiosk || kiosk.teacherUid !== uid) throw new HttpsError('not-found', 'Display not found.');
    if (kiosk.revokedAt) return;
    const now = Timestamp.fromMillis(ctx.now());
    tx.update(kioskRef(ctx, input.kioskId), { revokedAt: now });
    tx.update(refs(ctx.db).display(kiosk.roomId), { updatedAt: now });
  });
  await auth.revokeRefreshTokens(kioskUid(input.kioskId)).catch((e: { code?: string }) => {
    if (e.code !== 'auth/user-not-found') throw e;
  });
  return { ok: true };
}

/** Kiosk heartbeat bookkeeping: lastSeenAt at most every few minutes. */
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
export async function touchKiosk(ctx: Ctx, kioskId: string, lastSeenAt: Timestamp | null): Promise<void> {
  const nowMs = ctx.now();
  if (lastSeenAt && nowMs - lastSeenAt.toMillis() < LAST_SEEN_THROTTLE_MS) return;
  await kioskRef(ctx, kioskId).update({ lastSeenAt: Timestamp.fromMillis(nowMs) });
}

/** Every 60s from the kiosk: keep the room current and report the server clock. */
export async function kioskHeartbeat(ctx: Ctx, claims: { kioskId: string; roomId: string }): Promise<{ serverNow: number }> {
  const kiosk = (await kioskRef(ctx, claims.kioskId).get()).data();
  if (!kiosk || kiosk.revokedAt || kiosk.roomId !== claims.roomId) throw new HttpsError('permission-denied', 'This display is not paired.');
  await refreshRoom(ctx, claims.roomId);
  await touchKiosk(ctx, claims.kioskId, kiosk.lastSeenAt);
  return { serverNow: ctx.now() };
}
