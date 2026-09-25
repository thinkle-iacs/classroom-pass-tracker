// One Firebase app per role. The kiosk and teacher use separately named apps, so
// their Auth sessions (IndexedDB) never mix on a shared classroom computer.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import type { EndpointName, Endpoints } from '@pass/shared';
import { EMULATOR_PORTS, EMULATOR_PROJECT_ID, firebaseConfig } from './firebase-config';

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

export type Call = <K extends EndpointName>(name: K, data: Endpoints[K]['request']) => Promise<Endpoints[K]['response']>;

export function connect(role: 'teacher' | 'kiosk') {
  const app = initializeApp(useEmulators ? { ...firebaseConfig, projectId: EMULATOR_PROJECT_ID } : firebaseConfig, role);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'us-central1');
  if (useEmulators) {
    const host = location.hostname;
    connectAuthEmulator(auth, `http://${host}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, EMULATOR_PORTS.firestore);
    connectFunctionsEmulator(functions, host, EMULATOR_PORTS.functions);
  }
  const call: Call = async (name, data) => (await httpsCallable(functions, name)(data)).data as never;
  return { app, auth, db, call };
}

/** "permission-denied", whether it came from Firestore or a callable ("functions/permission-denied"). */
export function errorCode(e: unknown): string {
  return String((e as { code?: unknown })?.code ?? 'unknown').replace(/^functions\//, '');
}

export function errorMessage(e: unknown): string {
  const message = (e as { message?: unknown })?.message;
  return typeof message === 'string' && message ? message : 'Something went wrong. Try again.';
}
