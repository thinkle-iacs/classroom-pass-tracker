// The MVP vertical slice through the deployed-shape callables in the Functions
// emulator, with the web SDK as teacher and kiosk (SPEC §23). Real clock, so the
// test picks the class by hand and opens the start/end windows.
import { afterAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential, signInWithCustomToken } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { DisplayDoc, EndpointName, Endpoints, TeacherDoc } from '@pass/shared';
import { PROJECT_ID } from './helpers';

const apps: FirebaseApp[] = [];
function client(name: string) {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key', appId: 'demo-app' }, `${name}-${Date.now()}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9119', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
  const fns = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5011);
  const call = async <K extends EndpointName>(name: K, data: Endpoints[K]['request']) =>
    (await httpsCallable<Endpoints[K]['request'], Endpoints[K]['response']>(fns, name)(data)).data;
  return { auth, db, call };
}
afterAll(async () => { await Promise.all(apps.map((a) => deleteApp(a))); });

/** Callable errors arrive as "functions/not-found"; Firestore ones as "permission-denied". */
const codeOf = (p: Promise<unknown>) => p.then(() => undefined, (e: { code?: string }) => e.code?.replace(/^functions\//, ''));

describe('vertical slice (callables)', () => {
  it('teacher syncs and pairs, kiosk runs a pass, teacher sees the record, revoke locks the kiosk out', async () => {
    const teacher = client('teacher');
    const email = `e2e-${Date.now()}@innovationcharter.org`;
    // Emulator dev sign-in (ARCHITECTURE.md): a Google credential the Auth emulator accepts as-is.
    await signInWithCredential(teacher.auth, GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })));
    const uid = teacher.auth.currentUser!.uid;

    expect(await teacher.call('syncRoster', {})).toMatchObject({ sections: 5 });
    const profile = (await getDoc(doc(teacher.db, `teachers/${uid}`))).data() as TeacherDoc;
    const section = profile.sections.find((s) => s.title === 'Journalism')!;
    await teacher.call('setSectionOverride', { sectionKey: section.key });
    await teacher.call('updateSettings', { settings: { warningAfterMinutes: 5, attendanceThresholdMinutes: 15, noPassFirstMinutes: 0, noPassLastMinutes: 0 } });
    expect(await codeOf(teacher.call('invalidatePass', { passId: 'nonexistent', note: '' }))).toBe('not-found');
    expect(await codeOf(teacher.call('setPaused', { paused: 'yes' as unknown as boolean }))).toBe('invalid-argument');

    const { code } = await teacher.call('createPairingCode', {});
    const kiosk = client('kiosk');
    expect(await codeOf(kiosk.call('kioskHeartbeat', {}))).toBe('unauthenticated');
    const paired = await kiosk.call('pairKiosk', { code: code.toLowerCase(), label: 'Front board' });
    expect(paired.roomId).toBe(profile.roomId);
    await signInWithCustomToken(kiosk.auth, paired.token);
    // A kiosk token can't use teacher controls.
    expect(await codeOf(kiosk.call('setPaused', { paused: true }))).toBe('permission-denied');

    const { serverNow } = await kiosk.call('kioskHeartbeat', {});
    expect(Math.abs(serverNow - Date.now())).toBeLessThan(60_000);

    const displayRef = doc(kiosk.db, `displays/${paired.roomId}`);
    const display = (await getDoc(displayRef)).data() as DisplayDoc;
    expect(display).toMatchObject({ sectionTitle: 'Journalism', paused: false, active: null });
    expect(display.roster.length).toBeGreaterThan(10);
    const { k, name } = display.roster[0]!;

    const started = await kiosk.call('kioskStartPass', { k, requestId: 'e2e-request-1' });
    const retried = await kiosk.call('kioskStartPass', { k, requestId: 'e2e-request-1' });
    expect(retried.passId).toBe(started.passId);
    expect(await codeOf(kiosk.call('kioskStartPass', { k: display.roster[1]!.k, requestId: 'e2e-request-2' }))).toBe('failed-precondition');
    expect(((await getDoc(displayRef)).data() as DisplayDoc).active).toMatchObject({ k, name });
    await kiosk.call('kioskReturn', { k, requestId: 'e2e-request-3' });

    const passes = await getDocs(query(collection(teacher.db, 'passes'), where('teacherUid', '==', uid), orderBy('departedAt', 'desc'), limit(5)));
    expect(passes.docs.map((d) => d.id)).toEqual([started.passId]);
    expect(passes.docs[0]!.data()).toMatchObject({ status: 'completed', studentName: name, sectionTitle: 'Journalism', startSource: 'kiosk', endSource: 'kiosk' });

    // Revoke: the open listener and the next callable are both denied.
    let first!: () => void;
    const firstSnap = new Promise<void>((r) => { first = r; });
    const denied = new Promise<string>((resolve) => {
      const stop = onSnapshot(displayRef, () => first(), (e) => { stop(); resolve(e.code); });
    });
    await firstSnap;
    const kiosks = await getDocs(query(collection(teacher.db, 'kiosks'), where('teacherUid', '==', uid)));
    expect(kiosks.docs.map((d) => d.get('label'))).toEqual(['Front board']);
    await teacher.call('revokeKiosk', { kioskId: paired.kioskId });
    expect(await denied).toBe('permission-denied');
    expect(await codeOf(kiosk.call('kioskHeartbeat', {}))).toBe('permission-denied');
    expect(await codeOf(getDoc(displayRef))).toBe('permission-denied');
  }, 90_000); // every callable cold-starts an emulator worker
});
