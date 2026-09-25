// Shared setup for Functions integration tests. They run inside
// `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST for the Admin SDK.
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Principal } from '../src/auth';
import type { KioskAuth } from '../src/pairing';
import type { Ctx } from '../src/room';

export const PROJECT_ID = 'demo-pass-tracker';

export function adminDb(): Firestore {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with `npm run test:emulated` (FIRESTORE_EMULATOR_HOST is not set).');
  const app = getApps().find((a) => a.name === 'tests') ?? initializeApp({ projectId: PROJECT_ID }, 'tests');
  return getFirestore(app);
}

/** Monday 2026-09-28, 10:00 America/New_York: 20 minutes into HS Block 2. */
export const MONDAY_10AM = Date.parse('2026-09-28T14:00:00Z');
export const MINUTE = 60_000;

export interface TestCtx extends Ctx { set(ms: number): void; advance(ms: number): void }
export function testCtx(db: Firestore, start = MONDAY_10AM): TestCtx {
  let t = start;
  return { db, now: () => t, set: (ms) => { t = ms; }, advance: (ms) => { t += ms; } };
}

export function newTeacher(): Principal {
  const id = randomUUID().slice(0, 8);
  return { uid: `teacher-${id}`, email: `teacher-${id}@innovationcharter.org`, name: `Test Teacher ${id}` };
}

/** Records tokens instead of minting them; module tests don't need Auth. */
export function fakeAuth(): KioskAuth & { revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    createCustomToken: async (uid, claims) => `fake-token:${uid}:${JSON.stringify(claims)}`,
    revokeRefreshTokens: async (uid) => { revoked.push(uid); },
  };
}

export async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try { await p; return undefined; } catch (e) { return (e as { code?: string }).code; }
}
