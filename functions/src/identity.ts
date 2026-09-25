import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

// The privacy boundary.
//
//   Aspen sourcedId --(studentIdentities/{sha256}, Functions-only)--> appStudentId
//   appStudentId    --(HMAC with rooms/{id}.displaySalt)------------> kiosk key "k"
//
// appStudentId is random, so it cannot be turned back into an Aspen id without the
// Functions-only collection. The kiosk never sees appStudentId either: it sees a
// per-room, rotating HMAC of it.

export function newOpaqueId(bytes = 12): string {
  return randomBytes(bytes).toString('base64url');
}

export function identityDocId(aspenStudentId: string): string {
  return createHash('sha256').update(`aspen-student:${aspenStudentId}`).digest('hex');
}

export function sectionKeyFor(aspenClassId: string): string {
  return createHash('sha256').update(`aspen-class:${aspenClassId}`).digest('base64url').slice(0, 20);
}

export function kioskKey(displaySalt: string, appStudentId: string): string {
  return createHmac('sha256', displaySalt).update(appStudentId).digest('base64url').slice(0, 16);
}

/** Look up or mint app ids for Aspen student ids. Safe under concurrent syncs. */
export async function appStudentIds(db: Firestore, aspenIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(aspenIds)];
  const result = new Map<string, string>();
  const refs = unique.map((id) => db.collection('studentIdentities').doc(identityDocId(id)));
  for (let i = 0; i < refs.length; i += 300) {
    const chunk = refs.slice(i, i + 300);
    const snaps = await db.getAll(...chunk);
    snaps.forEach((snap, j) => { if (snap.exists) result.set(unique[i + j]!, snap.get('appStudentId') as string); });
  }
  for (const [index, aspenId] of unique.entries()) {
    if (result.has(aspenId)) continue;
    const ref = refs[index]!;
    const appStudentId = newOpaqueId();
    try {
      await ref.create({ appStudentId, aspenSourcedId: aspenId, createdAt: FieldValue.serverTimestamp() });
      result.set(aspenId, appStudentId);
    } catch {
      // Another sync created it first.
      result.set(aspenId, (await ref.get()).get('appStudentId') as string);
    }
  }
  return result;
}
