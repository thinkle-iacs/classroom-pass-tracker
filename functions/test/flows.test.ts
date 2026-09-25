// Functions modules against the Firestore emulator, with a pinned clock.
import { describe, expect, it } from 'vitest';
import type { Timestamp } from 'firebase-admin/firestore';
import { FIXTURE_CLASSES, FIXTURE_ROSTERS } from '@pass/shared/fixtures';
import type { DisplayDoc, PassDoc, RoomDoc, TeacherDoc } from '@pass/shared';
import { invalidatePass, kioskReturn, kioskStartPass, reassignPass, teacherEndPass } from '../src/passes';
import { createPairingCode, kioskHeartbeat, pairKiosk, revokeKiosk, PAIRING_TTL_MS } from '../src/pairing';
import { setDisplayName, setPaused, setSectionOverride, updateSettings } from '../src/controls';
import { refreshRoom } from '../src/room';
import { sectionKeyFor } from '../src/identity';
import { FixtureSource } from '../src/sis';
import { syncRoster } from '../src/sync';
import { adminDb, codeOf, fakeAuth, MINUTE, MONDAY_10AM, newTeacher, testCtx } from './helpers';

const db = adminDb();
const B2 = sectionKeyFor('fx-class-eng10-b2'); // meets Monday 09:40-11:02

async function pairedRoom() {
  const ctx = testCtx(db);
  const teacher = newTeacher();
  const auth = fakeAuth();
  await syncRoster(ctx, teacher, new FixtureSource());
  const pair = async (label?: string) => {
    const { code } = await createPairingCode(ctx, teacher);
    const { kioskId, roomId } = await pairKiosk(ctx, auth, { code, label });
    return { uid: `kiosk_${kioskId}`, kioskId, roomId };
  };
  const kiosk = await pair();
  const display = async () => (await db.doc(`displays/${kiosk.roomId}`).get()).data() as DisplayDoc<Timestamp>;
  const room = async () => (await db.doc(`rooms/${kiosk.roomId}`).get()).data() as RoomDoc<Timestamp>;
  const pass = async (id: string) => (await db.doc(`passes/${id}`).get()).data() as PassDoc<Timestamp>;
  return { ctx, teacher, auth, kiosk, pair, display, room, pass };
}

describe('sync and display', () => {
  it('shows the scheduled roster with names and kiosk keys only', async () => {
    const { display } = await pairedRoom();
    const d = await display();
    expect(d.sectionTitle).toBe('English 10');
    expect(d.block).toMatchObject({ startMinutes: 9 * 60 + 40, endMinutes: 11 * 60 + 2 });
    expect(d.block!.startAt).toBe(MONDAY_10AM - 20 * MINUTE);
    expect(d.roster).toHaveLength(FIXTURE_ROSTERS['fx-class-eng10-b2']!.length);
    for (const entry of d.roster) expect(Object.keys(entry).sort()).toEqual(['k', 'name']);
  });

  it('keeps Aspen ids, emails and app ids out of displays/*', async () => {
    const { ctx, kiosk, teacher, display } = await pairedRoom();
    const students = await db.collection(`teachers/${teacher.uid}/students`).get();
    const { k } = (await display()).roster[0]!;
    await kioskStartPass(ctx, kiosk, { k, requestId: 'privacy-check-1' });
    const json = JSON.stringify(await display());
    const forbidden = [
      ...FIXTURE_CLASSES.map((c) => c.sourcedId),
      ...Object.values(FIXTURE_ROSTERS).flat().flatMap((s) => [s.sourcedId, s.email]),
      ...students.docs.map((d) => d.id),
      ...FIXTURE_CLASSES.map((c) => sectionKeyFor(c.sourcedId)),
      teacher.uid, teacher.email, '@',
    ];
    for (const value of forbidden) expect(json).not.toContain(value);
  });

  it('keeps display-name overrides across re-sync, and rotates kiosk keys', async () => {
    const { ctx, teacher, kiosk, display } = await pairedRoom();
    const before = await display();
    const students = await db.collection(`teachers/${teacher.uid}/students`).where('sectionKeys', 'array-contains', B2).get();
    const target = students.docs[0]!;
    await expect(setDisplayName(ctx, teacher.uid, { appStudentId: target.id, displayName: '  Birdie ' })).resolves.toEqual({ displayName: 'Birdie' });
    expect((await display()).roster.map((s) => s.name)).toContain('Birdie');

    await syncRoster(ctx, teacher, new FixtureSource());
    expect((await target.ref.get()).get('displayNameOverride')).toBe('Birdie');
    const after = await display();
    expect(after.roster.map((s) => s.name)).toContain('Birdie');
    const oldKeys = new Set(before.roster.map((s) => s.k));
    expect(after.roster.some((s) => oldKeys.has(s.k))).toBe(false);
    // A kiosk holding a pre-sync key can't start a pass with it.
    expect(await codeOf(kioskStartPass(ctx, kiosk, { k: before.roster[0]!.k, requestId: 'old-key-0001' }))).toBe('not-found');

    await setDisplayName(ctx, teacher.uid, { appStudentId: target.id, displayName: null });
    expect((await display()).roster.map((s) => s.name)).not.toContain('Birdie');
  });

  it('shows no roster outside class time, and honours a manual override for today only', async () => {
    const { ctx, teacher, kiosk, display } = await pairedRoom();
    ctx.set(Date.parse('2026-09-28T23:00:00Z')); // 7pm
    await refreshRoom(ctx, kiosk.roomId);
    expect((await display()).roster).toEqual([]);
    expect(await codeOf(kioskStartPass(ctx, kiosk, { k: 'whatever-key', requestId: 'no-class-0001' }))).toBe('failed-precondition');

    await setSectionOverride(ctx, teacher.uid, { sectionKey: B2 });
    const manual = await display();
    expect(manual).toMatchObject({ manual: true, block: null, sectionTitle: 'English 10' });
    await expect(kioskStartPass(ctx, kiosk, { k: manual.roster[0]!.k, requestId: 'manual-0001' })).resolves.toHaveProperty('passId');
    await kioskReturn(ctx, kiosk, { k: manual.roster[0]!.k, requestId: 'manual-0002' });

    ctx.set(Date.parse('2026-09-29T23:00:00Z')); // next evening: override expired
    await refreshRoom(ctx, kiosk.roomId);
    expect((await display()).roster).toEqual([]);
  });

  it('heartbeat writes nothing when nothing changed', async () => {
    const { ctx, kiosk, display } = await pairedRoom();
    const before = (await display()).updatedAt.toMillis();
    ctx.advance(MINUTE);
    await expect(kioskHeartbeat(ctx, kiosk)).resolves.toEqual({ serverNow: ctx.now() });
    expect((await display()).updatedAt.toMillis()).toBe(before);
    expect(await refreshRoom(ctx, kiosk.roomId)).toBe(false);
  });
});

describe('passes', () => {
  it('starts and returns with server timestamps', async () => {
    const { ctx, kiosk, display, room, pass } = await pairedRoom();
    const { k, name } = (await display()).roster[2]!;
    const { passId } = await kioskStartPass(ctx, kiosk, { k, requestId: 'start-0001' });
    const out = await display();
    expect(out.active).toMatchObject({ k, name });
    expect(out.active!.departedAt.toMillis()).toBe(MONDAY_10AM);
    expect((await room()).activePass?.passId).toBe(passId);

    ctx.advance(6 * MINUTE);
    await kioskReturn(ctx, kiosk, { k, requestId: 'return-0001' });
    const p = await pass(passId);
    expect(p).toMatchObject({ status: 'completed', startSource: 'kiosk', endSource: 'kiosk', studentName: name, sectionTitle: 'English 10' });
    expect(p.returnedAt!.toMillis() - p.departedAt.toMillis()).toBe(6 * MINUTE);
    const back = await display();
    expect(back.active).toBeNull();
    expect(back.togetherSince!.toMillis()).toBe(MONDAY_10AM + 6 * MINUTE);
  });

  it('double tap returns the same pass', async () => {
    const { ctx, kiosk, display } = await pairedRoom();
    const { k } = (await display()).roster[0]!;
    const [a, b] = await Promise.all([
      kioskStartPass(ctx, kiosk, { k, requestId: 'double-tap-1' }),
      kioskStartPass(ctx, kiosk, { k, requestId: 'double-tap-1' }),
    ]);
    expect(a.passId).toBe(b.passId);
    const passes = await db.collection('passes').where('roomId', '==', kiosk.roomId).get();
    expect(passes.size).toBe(1);
  });

  it('simultaneous starts from two kiosks create exactly one pass', async () => {
    const { ctx, kiosk, pair, display, room } = await pairedRoom();
    const second = await pair('Back table');
    const roster = (await display()).roster;
    const results = await Promise.allSettled([
      kioskStartPass(ctx, kiosk, { k: roster[0]!.k, requestId: 'race-kiosk-a' }),
      kioskStartPass(ctx, second, { k: roster[1]!.k, requestId: 'race-kiosk-b' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('failed-precondition');
    const passes = await db.collection('passes').where('roomId', '==', kiosk.roomId).get();
    expect(passes.size).toBe(1);
    expect((await room()).activePass?.passId).toBe(passes.docs[0]!.id);
  });

  it('enforces availability for starting, never for returning', async () => {
    const { ctx, teacher, kiosk, display } = await pairedRoom();
    const [a, b] = (await display()).roster;
    await kioskStartPass(ctx, kiosk, { k: a!.k, requestId: 'avail-0001' });
    await setPaused(ctx, teacher.uid, { paused: true });
    expect((await display()).paused).toBe(true);
    await expect(kioskReturn(ctx, kiosk, { k: a!.k, requestId: 'avail-0002' })).resolves.toMatchObject({ ok: true });
    expect((await display()).active).toBeNull();
    await expect(kioskStartPass(ctx, kiosk, { k: b!.k, requestId: 'avail-0003' })).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'paused' } });

    await setPaused(ctx, teacher.uid, { paused: false });
    ctx.set(MONDAY_10AM - 15 * MINUTE); // 09:45, first 10 minutes of Block 2
    await expect(kioskStartPass(ctx, kiosk, { k: b!.k, requestId: 'avail-0004' })).rejects.toMatchObject({ details: { reason: 'start-of-class' } });
    await updateSettings(ctx, teacher.uid, { settings: { warningAfterMinutes: 4, attendanceThresholdMinutes: 12, noPassFirstMinutes: 0, noPassLastMinutes: 5 } });
    expect((await display()).settings.warningAfterMinutes).toBe(4);
    await expect(kioskStartPass(ctx, kiosk, { k: b!.k, requestId: 'avail-0005' })).resolves.toHaveProperty('passId');
  });

  it('return with a stale or mismatched key is a no-op', async () => {
    const { ctx, kiosk, display, room } = await pairedRoom();
    const [a, b] = (await display()).roster;
    await kioskReturn(ctx, kiosk, { k: a!.k, requestId: 'noop-0001' });
    await kioskStartPass(ctx, kiosk, { k: a!.k, requestId: 'noop-0002' });
    await kioskReturn(ctx, kiosk, { k: b!.k, requestId: 'noop-0003' });
    expect((await room()).activePass).not.toBeNull();
  });

  it('flags a pass left open past the class as stale', async () => {
    const { ctx, teacher, kiosk, display, room, pass } = await pairedRoom();
    const { k } = (await display()).roster[0]!;
    const { passId } = await kioskStartPass(ctx, kiosk, { k, requestId: 'stale-0001' });
    ctx.set(Date.parse('2026-09-29T13:30:00Z')); // next morning
    await kioskHeartbeat(ctx, kiosk);
    const p = await pass(passId);
    expect(p).toMatchObject({ status: 'active', needsReview: true });
    expect(p.corrections.map((c) => c.action)).toEqual(['flagged-stale']);
    expect((await room()).activePass).toBeNull();
    expect((await display()).active).toBeNull();

    const late = MONDAY_10AM + 30 * MINUTE;
    await expect(codeOf(teacherEndPass(ctx, teacher.uid, { passId, returnedAt: MONDAY_10AM - MINUTE }))).resolves.toBe('invalid-argument');
    await teacherEndPass(ctx, teacher.uid, { passId, returnedAt: late });
    const ended = await pass(passId);
    expect(ended).toMatchObject({ status: 'completed', endSource: 'teacher', needsReview: false });
    expect(ended.returnedAt!.toMillis()).toBe(late);
    expect(ended.corrections.map((c) => c.action)).toEqual(['flagged-stale', 'ended']);
  });
});

describe('teacher corrections', () => {
  it('ends, invalidates and reassigns with an audit trail', async () => {
    const { ctx, teacher, kiosk, display, pass, room } = await pairedRoom();
    const [a, b] = (await display()).roster;
    const { passId } = await kioskStartPass(ctx, kiosk, { k: a!.k, requestId: 'fix-00001' });

    const students = await db.collection(`teachers/${teacher.uid}/students`).get();
    const outId = (await room()).activePass!.appStudentId;
    const other = students.docs.find((d) => d.id !== outId && d.get('sectionKeys').includes(B2))!;
    await reassignPass(ctx, teacher.uid, { passId, appStudentId: other.id, note: 'Wrong name tapped' });
    const moved = await pass(passId);
    expect(moved.appStudentId).toBe(other.id);
    expect(moved.corrections[0]).toMatchObject({ action: 'reassigned', by: teacher.uid, note: 'Wrong name tapped', previous: { studentName: a!.name } });
    expect((await display()).active?.name).toBe(other.get('defaultDisplayName'));

    ctx.advance(3 * MINUTE);
    await teacherEndPass(ctx, teacher.uid, { passId });
    expect(await pass(passId)).toMatchObject({ status: 'completed', endSource: 'teacher' });
    expect((await display()).active).toBeNull();
    expect(await codeOf(teacherEndPass(ctx, teacher.uid, { passId }))).toBe('failed-precondition');

    await invalidatePass(ctx, teacher.uid, { passId, note: 'Test' });
    const dead = await pass(passId);
    expect(dead.status).toBe('invalidated');
    expect(dead.corrections.map((c) => c.action)).toEqual(['reassigned', 'ended', 'invalidated']);
    expect(dead.corrections[2]!.previous).toMatchObject({ status: 'completed' });

    // Invalidating an active pass frees the room.
    const second = await kioskStartPass(ctx, kiosk, { k: b!.k, requestId: 'fix-00002' });
    await invalidatePass(ctx, teacher.uid, { passId: second.passId, note: '' });
    expect((await room()).activePass).toBeNull();
  });

  it("can't touch another teacher's pass or students", async () => {
    const { ctx, kiosk, display } = await pairedRoom();
    const other = newTeacher();
    await syncRoster(ctx, other, new FixtureSource());
    const { passId } = await kioskStartPass(ctx, kiosk, { k: (await display()).roster[0]!.k, requestId: 'cross-0001' });
    expect(await codeOf(teacherEndPass(ctx, other.uid, { passId }))).toBe('not-found');
    expect(await codeOf(invalidatePass(ctx, other.uid, { passId, note: '' }))).toBe('not-found');
    expect(await codeOf(setSectionOverride(ctx, other.uid, { sectionKey: 'not-a-section' }))).toBe('not-found');
  });
});

describe('pairing', () => {
  it('codes are single use and expire', async () => {
    const { ctx, teacher, auth } = await pairedRoom();
    const { code, expiresAt } = await createPairingCode(ctx, teacher);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(expiresAt).toBe(ctx.now() + PAIRING_TTL_MS);
    const paired = await pairKiosk(ctx, auth, { code });
    expect((await db.doc(`kiosks/${paired.kioskId}`).get()).data()).toMatchObject({ teacherUid: teacher.uid, label: 'Classroom display', revokedAt: null });
    expect(await codeOf(pairKiosk(ctx, auth, { code }))).toBe('not-found');

    const late = await createPairingCode(ctx, teacher);
    ctx.advance(PAIRING_TTL_MS + 1);
    expect(await codeOf(pairKiosk(ctx, auth, { code: late.code }))).toBe('not-found');
  });

  it('retries on a code collision', async () => {
    const { ctx, teacher } = await pairedRoom();
    const first = await createPairingCode(ctx, teacher);
    const codes = [first.code, 'ZZZZ22'];
    const seen: string[] = [];
    const next = await createPairingCode(ctx, teacher, () => { const c = codes.shift()!; seen.push(c); return c; });
    expect(seen).toEqual([first.code, 'ZZZZ22']);
    expect(next.code).toBe('ZZZZ22');
    await db.doc('pairingCodes/ZZZZ22').delete();
  });

  it('a revoked kiosk is refused by every kiosk callable', async () => {
    const { ctx, teacher, auth, kiosk, display } = await pairedRoom();
    const { k } = (await display()).roster[0]!;
    await revokeKiosk(ctx, auth, teacher.uid, { kioskId: kiosk.kioskId });
    expect(auth.revoked).toEqual([kiosk.uid]);
    const codes = await Promise.all([
      codeOf(kioskHeartbeat(ctx, kiosk)),
      codeOf(kioskStartPass(ctx, kiosk, { k, requestId: 'revoked-001' })),
      codeOf(kioskReturn(ctx, kiosk, { k, requestId: 'revoked-002' })),
    ]);
    expect(codes).toEqual(['permission-denied', 'permission-denied', 'permission-denied']);
    expect(await codeOf(revokeKiosk(ctx, auth, newTeacher().uid, { kioskId: kiosk.kioskId }))).toBe('not-found');
  });

  it('a kiosk cannot act on another room with its own kiosk record', async () => {
    const a = await pairedRoom();
    const b = await pairedRoom();
    const forged = { ...a.kiosk, roomId: b.kiosk.roomId };
    expect(await codeOf(kioskHeartbeat(a.ctx, forged))).toBe('permission-denied');
  });

  it('first sign-in creates teacher, room and an empty display', async () => {
    const ctx = testCtx(db);
    const teacher = newTeacher();
    await createPairingCode(ctx, teacher);
    const t = (await db.doc(`teachers/${teacher.uid}`).get()).data() as TeacherDoc<Timestamp>;
    expect(t).toMatchObject({ email: teacher.email, sections: [], lastSyncAt: null });
    expect((await db.doc(`rooms/${t.roomId}`).get()).get('teacherUid')).toBe(teacher.uid);
    expect((await db.doc(`displays/${t.roomId}`).get()).data()).toMatchObject({ roster: [], active: null, sectionTitle: null });
  });
});
