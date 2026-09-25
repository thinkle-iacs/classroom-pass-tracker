import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

// Copied from google-classroom-sync-web/functions/src/auth.ts.
export interface Principal { uid: string; email: string; name: string }
export function requirePrincipal(auth: CallableRequest['auth'], allowedDomain: string): Principal {
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in with your school Google account.');
  if (auth.token.kiosk) throw new HttpsError('permission-denied', 'Classroom displays cannot use teacher controls.');
  const email = auth.token.email?.trim().toLowerCase();
  if (!email || !allowedDomain || auth.token.email_verified !== true || email.split('@')[1] !== allowedDomain.toLowerCase() || auth.token.firebase?.sign_in_provider !== 'google.com') {
    throw new HttpsError('permission-denied', 'A verified school Google account is required.');
  }
  return { uid: auth.uid, email, name: typeof auth.token.name === 'string' ? auth.token.name : email.split('@')[0]! };
}

/** Claims minted by pairKiosk. Revocation is checked separately against kiosks/{kioskId}. */
export interface KioskClaims { uid: string; kioskId: string; roomId: string }
export function requireKioskClaims(auth: CallableRequest['auth']): KioskClaims {
  if (!auth) throw new HttpsError('unauthenticated', 'This display is not paired.');
  const { kiosk, kioskId, roomId } = auth.token as Record<string, unknown>;
  if (kiosk !== true || typeof kioskId !== 'string' || typeof roomId !== 'string' || auth.uid !== `kiosk_${kioskId}`) {
    throw new HttpsError('permission-denied', 'This display is not paired.');
  }
  return { uid: auth.uid, kioskId, roomId };
}
