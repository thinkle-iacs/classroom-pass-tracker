// Callable Function entry point. Contracts live in shared/src/api.ts; flows are
// in docs/ARCHITECTURE.md. Handlers only authenticate, parse and delegate.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableOptions, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { schemas, type EndpointName, type Endpoints } from '@pass/shared';
import type { z } from 'zod';
import { requireKioskClaims, requirePrincipal } from './auth';
import { setDisplayName as rename, setPaused as pause, setSectionOverride as override, updateSettings as settings } from './controls';
import { createPairingCode as makeCode, kioskHeartbeat as heartbeat, pairKiosk as pair, revokeKiosk as revoke } from './pairing';
import {
  invalidatePass as invalidate, kioskReturn as returnPass, kioskStartPass as startPass, reassignPass as reassign, teacherEndPass as endPass,
} from './passes';
import { systemCtx } from './room';
import { FixtureSource, OneRosterSource, type SisSource } from './sis';
import { syncRoster as runSync } from './sync';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10, timeoutSeconds: 60, memory: '256MiB' });

const SIS_MODE = defineString('SIS_MODE', { default: 'oneroster', description: '"oneroster" (Aspen) or "fixture" (synthetic data, emulators only)' });
const ALLOWED_DOMAIN = defineString('ALLOWED_DOMAIN', { default: 'innovationcharter.org' });
const ONEROSTER_BASE_URL = defineString('ONEROSTER_BASE_URL', { default: '' });
const ONEROSTER_TOKEN_URL = defineString('ONEROSTER_TOKEN_URL', { default: '' });
const ONEROSTER_CLIENT_ID = defineSecret('ONEROSTER_CLIENT_ID');
const ONEROSTER_CLIENT_SECRET = defineSecret('ONEROSTER_CLIENT_SECRET');

const ctx = () => systemCtx(getFirestore());

function sisSource(): SisSource {
  if (SIS_MODE.value() === 'fixture') {
    if (!process.env.FUNCTIONS_EMULATOR) throw new HttpsError('failed-precondition', 'Fixture rosters are for the emulators only.');
    return new FixtureSource();
  }
  return new OneRosterSource({
    baseUrl: ONEROSTER_BASE_URL.value(), tokenUrl: ONEROSTER_TOKEN_URL.value(),
    clientId: ONEROSTER_CLIENT_ID.value(), clientSecret: ONEROSTER_CLIENT_SECRET.value(),
  });
}

type Input<K extends EndpointName> = z.output<(typeof schemas)[K]>;
type Handler<K extends EndpointName> = (input: Input<K>, request: CallableRequest<unknown>) => Promise<Endpoints[K]['response']>;

function callable<K extends EndpointName>(name: K, handler: Handler<K>, options: CallableOptions = {}) {
  return onCall(options, async (request) => {
    const parsed = schemas[name].safeParse(request.data ?? {});
    if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Invalid request.');
    return handler(parsed.data as Input<K>, request);
  });
}

const teacher = (request: CallableRequest<unknown>) => requirePrincipal(request.auth, ALLOWED_DOMAIN.value());
const kiosk = (request: CallableRequest<unknown>) => requireKioskClaims(request.auth);
const kioskAuth = () => {
  const auth = getAuth();
  return {
    createCustomToken: (uid: string, claims: Record<string, unknown>) => auth.createCustomToken(uid, claims),
    revokeRefreshTokens: (uid: string) => auth.revokeRefreshTokens(uid),
  };
};

// ------------------------------------------------------------------ teacher

export const syncRoster = callable('syncRoster', (_, req) => runSync(ctx(), teacher(req), sisSource()),
  { secrets: [ONEROSTER_CLIENT_ID, ONEROSTER_CLIENT_SECRET], timeoutSeconds: 120 });
export const createPairingCode = callable('createPairingCode', (_, req) => makeCode(ctx(), teacher(req)));
export const revokeKiosk = callable('revokeKiosk', (input, req) => revoke(ctx(), kioskAuth(), teacher(req).uid, input));
export const setPaused = callable('setPaused', (input, req) => pause(ctx(), teacher(req).uid, input));
export const setSectionOverride = callable('setSectionOverride', (input, req) => override(ctx(), teacher(req).uid, input));
export const updateSettings = callable('updateSettings', (input, req) => settings(ctx(), teacher(req).uid, input));
export const setDisplayName = callable('setDisplayName', (input, req) => rename(ctx(), teacher(req).uid, input));
export const teacherEndPass = callable('teacherEndPass', (input, req) => endPass(ctx(), teacher(req).uid, input));
export const invalidatePass = callable('invalidatePass', (input, req) => invalidate(ctx(), teacher(req).uid, input));
export const reassignPass = callable('reassignPass', (input, req) => reassign(ctx(), teacher(req).uid, input));

// -------------------------------------------------------------------- kiosk

export const pairKiosk = callable('pairKiosk', (input) => pair(ctx(), kioskAuth(), input));
export const kioskHeartbeat = callable('kioskHeartbeat', (_, req) => heartbeat(ctx(), kiosk(req)));
export const kioskStartPass = callable('kioskStartPass', (input, req) => startPass(ctx(), kiosk(req), input));
export const kioskReturn = callable('kioskReturn', (input, req) => returnPass(ctx(), kiosk(req), input));
