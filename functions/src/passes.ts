import { createHash } from 'node:crypto';
import { Timestamp, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { availability, effectiveName, schoolClock, UNAVAILABLE_MESSAGE, type Correction, type KioskDoc, type PassDoc } from '@pass/shared';
import type { KioskClaims } from './auth';
import { kioskKey } from './identity';
import { commitRoom, loadRoom, mutateTeacherRoom, refs, settle, type Ctx, type LoadedRoom } from './room';

// Starting, returning and correcting passes. Stored times always come from the
// Functions clock (ctx.now), never from a kiosk.

type Pass = PassDoc<Timestamp>;
const passRef = (ctx: Ctx, passId: string) => refs(ctx.db).pass(passId) as DocumentReference<Pass>;

/** Double taps and retries carry the same requestId, so they map to the same pass. */
export function passIdFor(kioskId: string, requestId: string): string {
  return createHash('sha256').update(`${kioskId}:${requestId}`).digest('hex').slice(0, 24);
}

/** The kiosk record must exist, be unrevoked, and match its token's room. */
export async function requireActiveKiosk(tx: Transaction, ctx: Ctx, claims: KioskClaims): Promise<KioskDoc<Timestamp>> {
  const snap = await tx.get(refs(ctx.db).kiosk(claims.kioskId));
  const kiosk = snap.data() as KioskDoc<Timestamp> | undefined;
  if (!kiosk || kiosk.revokedAt || kiosk.roomId !== claims.roomId) throw new HttpsError('permission-denied', 'This display is not paired.');
  return kiosk;
}

// --------------------------------------------------------------------- kiosk

export async function kioskStartPass(ctx: Ctx, claims: KioskClaims, input: { k: string; requestId: string }): Promise<{ passId: string; serverNow: number }> {
  const passId = passIdFor(claims.kioskId, input.requestId);
  return ctx.db.runTransaction(async (tx) => {
    const nowMs = ctx.now();
    await requireActiveKiosk(tx, ctx, claims);
    if ((await tx.get(passRef(ctx, passId))).exists) return { passId, serverNow: nowMs };

    const loaded = await loadRoom(tx, ctx.db, claims.roomId);
    settle(loaded, nowMs); // server clock decides the block, not rooms.current
    const { room, teacher } = loaded;
    if (room.activePass) throw new HttpsError('failed-precondition', 'Someone is already out.', { reason: 'already-out' });
    const current = room.current;
    const block = current?.startMinutes != null && current.endMinutes != null ? { startMinutes: current.startMinutes, endMinutes: current.endMinutes } : null;
    const allowed = availability({ paused: room.paused, block, manual: current?.manual ?? false, nowMinutes: schoolClock(nowMs).minutes, settings: teacher.settings });
    if (!allowed.allowed) throw new HttpsError('failed-precondition', UNAVAILABLE_MESSAGE[allowed.reason!], { reason: allowed.reason });

    const sectionSnap = await tx.get(refs(ctx.db).section(room.teacherUid, current!.sectionKey));
    const appStudentId = sectionSnap.data()?.studentIds.find((id) => kioskKey(room.displaySalt, id) === input.k);
    if (!appStudentId) throw new HttpsError('not-found', 'That name is no longer on this roster.');
    const student = (await tx.get(refs(ctx.db).student(room.teacherUid, appStudentId))).data();

    const now = Timestamp.fromMillis(nowMs);
    room.activePass = { passId, appStudentId, sectionKey: current!.sectionKey, departedAt: now };
    await commitRoom(tx, ctx.db, loaded, nowMs);
    const pass: Pass = {
      roomId: claims.roomId, teacherUid: room.teacherUid, sectionKey: current!.sectionKey, sectionTitle: sectionSnap.data()!.title,
      appStudentId, studentName: student ? effectiveName(student) : 'A student',
      departedAt: now, returnedAt: null, status: 'active', startSource: 'kiosk', endSource: null, kioskId: claims.kioskId,
      needsReview: false, corrections: [], createdAt: now, updatedAt: now,
    };
    tx.create(passRef(ctx, passId), pass);
    return { passId, serverNow: nowMs };
  });
}

/** Always allowed. A missing or mismatched active pass is an ok no-op (stale kiosk, double tap). */
export async function kioskReturn(ctx: Ctx, claims: KioskClaims, input: { k: string; requestId: string }): Promise<{ ok: true; serverNow: number }> {
  return ctx.db.runTransaction(async (tx) => {
    const nowMs = ctx.now();
    await requireActiveKiosk(tx, ctx, claims);
    const loaded = await loadRoom(tx, ctx.db, claims.roomId);
    const changed = settle(loaded, nowMs);
    const active = loaded.room.activePass;
    if (!active || kioskKey(loaded.room.displaySalt, active.appStudentId) !== input.k) {
      if (changed) await commitRoom(tx, ctx.db, loaded, nowMs);
      return { ok: true, serverNow: nowMs };
    }
    const now = Timestamp.fromMillis(nowMs);
    closeActive(loaded, now);
    await commitRoom(tx, ctx.db, loaded, nowMs);
    tx.update(passRef(ctx, active.passId), { returnedAt: now, status: 'completed', endSource: 'kiosk', updatedAt: now });
    return { ok: true, serverNow: nowMs };
  });
}

function closeActive(loaded: LoadedRoom, now: Timestamp) {
  loaded.room.activePass = null;
  loaded.room.togetherSince = now;
}

// ------------------------------------------------------------ teacher fixes

async function ownPass(tx: Transaction, ctx: Ctx, uid: string, passId: string): Promise<Pass> {
  const pass = (await tx.get(passRef(ctx, passId))).data();
  if (!pass || pass.teacherUid !== uid) throw new HttpsError('not-found', 'Pass not found.');
  return pass;
}

const correction = (at: Timestamp, by: string, action: Correction['action'], note: string | null, previous: Record<string, unknown>): Correction<Timestamp> =>
  ({ at, by, action, note: note || null, previous });

/** End an active pass now, or at an earlier time the teacher enters (forgotten returns). */
export async function teacherEndPass(ctx: Ctx, uid: string, input: { passId: string; returnedAt?: number }): Promise<{ ok: true }> {
  return mutateTeacherRoom(ctx, uid, async (loaded, tx, nowMs) => {
    const pass = await ownPass(tx, ctx, uid, input.passId);
    if (pass.status !== 'active') throw new HttpsError('failed-precondition', 'That pass has already ended.');
    const returnedAt = input.returnedAt ?? nowMs;
    if (returnedAt <= pass.departedAt.toMillis() || returnedAt > nowMs) {
      throw new HttpsError('invalid-argument', 'The return time must be after the departure and not in the future.');
    }
    if (loaded.room.activePass?.passId === input.passId) closeActive(loaded, Timestamp.fromMillis(nowMs));
    return {
      result: { ok: true as const },
      write: (now) => tx.update(passRef(ctx, input.passId), {
        returnedAt: Timestamp.fromMillis(returnedAt), status: 'completed', endSource: 'teacher', needsReview: false, updatedAt: now,
        corrections: [...pass.corrections, correction(now, uid, 'ended', null, { status: pass.status, returnedAt: pass.returnedAt, needsReview: pass.needsReview })],
      }),
    };
  });
}

/** Mark a pass as a mistake. It stays in the log but is excluded from analytics. */
export async function invalidatePass(ctx: Ctx, uid: string, input: { passId: string; note: string }): Promise<{ ok: true }> {
  return mutateTeacherRoom(ctx, uid, async (loaded, tx, nowMs) => {
    const pass = await ownPass(tx, ctx, uid, input.passId);
    if (pass.status === 'invalidated') return { result: { ok: true as const } };
    if (loaded.room.activePass?.passId === input.passId) closeActive(loaded, Timestamp.fromMillis(nowMs));
    return {
      result: { ok: true as const },
      write: (now) => tx.update(passRef(ctx, input.passId), {
        status: 'invalidated', needsReview: false, updatedAt: now,
        corrections: [...pass.corrections, correction(now, uid, 'invalidated', input.note, { status: pass.status, needsReview: pass.needsReview })],
      }),
    };
  });
}

/** The wrong name was tapped: move the pass to another student on this teacher's roster. */
export async function reassignPass(ctx: Ctx, uid: string, input: { passId: string; appStudentId: string; note: string }): Promise<{ ok: true }> {
  return mutateTeacherRoom(ctx, uid, async (loaded, tx) => {
    const pass = await ownPass(tx, ctx, uid, input.passId);
    if (pass.status === 'invalidated') throw new HttpsError('failed-precondition', 'That pass was invalidated.');
    const student = (await tx.get(refs(ctx.db).student(uid, input.appStudentId))).data();
    if (!student) throw new HttpsError('not-found', 'That student is not on your roster.');
    if (pass.appStudentId === input.appStudentId) return { result: { ok: true as const } };
    const active = loaded.room.activePass;
    if (active?.passId === input.passId) active.appStudentId = input.appStudentId;
    return {
      result: { ok: true as const },
      write: (now) => tx.update(passRef(ctx, input.passId), {
        appStudentId: input.appStudentId, studentName: effectiveName(student), updatedAt: now,
        corrections: [...pass.corrections, correction(now, uid, 'reassigned', input.note, { appStudentId: pass.appStudentId, studentName: pass.studentName })],
      }),
    };
  });
}
