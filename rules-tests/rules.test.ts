// Negative-first rules tests. Run with `npm run test:emulated` (needs Java for the Firestore emulator).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

let env: RulesTestEnvironment;
const teacher = { email: 'teacher@innovationcharter.org', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const otherTeacher = { email: 'other@innovationcharter.org', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const outsider = { email: 'someone@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const kioskClaims = (kioskId: string, roomId: string) => ({ kiosk: true, kioskId, roomId, firebase: { sign_in_provider: 'custom' } });

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-pass-tracker', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'teachers/t1'), { email: teacher.email, roomId: 'room1' });
    await setDoc(doc(db, 'teachers/t1/students/s1'), { givenName: 'Maya', familyName: 'Rivera' });
    await setDoc(doc(db, 'rooms/room1'), { teacherUid: 't1' });
    await setDoc(doc(db, 'displays/room1'), { roster: [{ k: 'abc', name: 'Maya R.' }] });
    await setDoc(doc(db, 'displays/room2'), { roster: [] });
    await setDoc(doc(db, 'kiosks/k1'), { roomId: 'room1', teacherUid: 't1', revokedAt: null });
    await setDoc(doc(db, 'kiosks/k2'), { roomId: 'room1', teacherUid: 't1', revokedAt: new Date() });
    await setDoc(doc(db, 'passes/p1'), { teacherUid: 't1', appStudentId: 's1' });
    await setDoc(doc(db, 'studentIdentities/x'), { appStudentId: 's1', aspenSourcedId: 'ASPEN123' });
  });
});

describe('kiosk', () => {
  it('reads only its own display', async () => {
    const db = env.authenticatedContext('kiosk_k1', kioskClaims('k1', 'room1')).firestore();
    await assertSucceeds(getDoc(doc(db, 'displays/room1')));
    await assertFails(getDoc(doc(db, 'displays/room2')));
    await assertFails(getDocs(collection(db, 'displays')));
  });
  it('cannot read teacher, room, pass, or identity data', async () => {
    const db = env.authenticatedContext('kiosk_k1', kioskClaims('k1', 'room1')).firestore();
    for (const path of ['teachers/t1', 'teachers/t1/students/s1', 'rooms/room1', 'passes/p1', 'kiosks/k1', 'studentIdentities/x']) {
      await assertFails(getDoc(doc(db, path)));
    }
  });
  it('is locked out once revoked', async () => {
    const db = env.authenticatedContext('kiosk_k2', kioskClaims('k2', 'room1')).firestore();
    await assertFails(getDoc(doc(db, 'displays/room1')));
  });
  it('cannot forge claims for another room', async () => {
    const db = env.authenticatedContext('kiosk_k1', kioskClaims('k1', 'room2')).firestore();
    await assertFails(getDoc(doc(db, 'displays/room2')));
  });
  it('cannot write its display', async () => {
    const db = env.authenticatedContext('kiosk_k1', kioskClaims('k1', 'room1')).firestore();
    await assertFails(setDoc(doc(db, 'displays/room1'), { roster: [] }));
  });
});

describe('teacher', () => {
  it('reads own data, never writes', async () => {
    const db = env.authenticatedContext('t1', teacher).firestore();
    await assertSucceeds(getDoc(doc(db, 'teachers/t1')));
    await assertSucceeds(getDoc(doc(db, 'teachers/t1/students/s1')));
    await assertSucceeds(getDoc(doc(db, 'rooms/room1')));
    await assertSucceeds(getDoc(doc(db, 'displays/room1')));
    await assertSucceeds(getDoc(doc(db, 'passes/p1')));
    await assertFails(setDoc(doc(db, 'passes/p2'), { teacherUid: 't1' }));
    await assertFails(getDoc(doc(db, 'studentIdentities/x')));
  });
  it("cannot read another teacher's data", async () => {
    const db = env.authenticatedContext('t2', otherTeacher).firestore();
    for (const path of ['teachers/t1', 'teachers/t1/students/s1', 'rooms/room1', 'displays/room1', 'passes/p1']) {
      await assertFails(getDoc(doc(db, path)));
    }
  });
  it('outsiders and anonymous get nothing', async () => {
    for (const db of [env.authenticatedContext('t1', outsider).firestore(), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(db, 'teachers/t1')));
      await assertFails(getDoc(doc(db, 'displays/room1')));
    }
  });
});
