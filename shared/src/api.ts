// Callable Function contracts, shared by web and functions.
import { z } from 'zod';
import { settingsSchema } from './model';

export const opaqueId = z.string().min(6).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const requestId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
/** 6 chars, no 0/O/1/I/L to survive being read off a projector. */
export const PAIRING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const pairingCode = z.string().transform((s) => s.trim().toUpperCase()).pipe(z.string().regex(new RegExp(`^[${PAIRING_ALPHABET}]{6}$`)));

export const schemas = {
  // teacher
  syncRoster: z.object({}).strict(),
  createPairingCode: z.object({}).strict(),
  revokeKiosk: z.object({ kioskId: opaqueId }).strict(),
  setPaused: z.object({ paused: z.boolean() }).strict(),
  setSectionOverride: z.object({ sectionKey: opaqueId.nullable() }).strict(),
  updateSettings: z.object({ settings: settingsSchema }).strict(),
  setDisplayName: z.object({ appStudentId: opaqueId, displayName: z.string().trim().max(24).nullable() }).strict(),
  teacherEndPass: z.object({ passId: opaqueId, returnedAt: z.number().int().positive().optional() }).strict(),
  invalidatePass: z.object({ passId: opaqueId, note: z.string().trim().max(200) }).strict(),
  reassignPass: z.object({ passId: opaqueId, appStudentId: opaqueId, note: z.string().trim().max(200) }).strict(),
  // kiosk (unauthenticated until paired)
  pairKiosk: z.object({ code: pairingCode, label: z.string().trim().max(40).optional() }).strict(),
  kioskHeartbeat: z.object({}).strict(),
  kioskStartPass: z.object({ k: opaqueId, requestId }).strict(),
  kioskReturn: z.object({ k: opaqueId, requestId }).strict(),
} as const;

type Req<K extends keyof typeof schemas> = z.input<(typeof schemas)[K]>;

export interface Endpoints {
  syncRoster: { request: Req<'syncRoster'>; response: { sections: number; students: number } };
  createPairingCode: { request: Req<'createPairingCode'>; response: { code: string; expiresAt: number } };
  revokeKiosk: { request: Req<'revokeKiosk'>; response: { ok: true } };
  setPaused: { request: Req<'setPaused'>; response: { ok: true } };
  setSectionOverride: { request: Req<'setSectionOverride'>; response: { ok: true } };
  updateSettings: { request: Req<'updateSettings'>; response: { ok: true } };
  setDisplayName: { request: Req<'setDisplayName'>; response: { displayName: string } };
  teacherEndPass: { request: Req<'teacherEndPass'>; response: { ok: true } };
  invalidatePass: { request: Req<'invalidatePass'>; response: { ok: true } };
  reassignPass: { request: Req<'reassignPass'>; response: { ok: true } };
  pairKiosk: { request: Req<'pairKiosk'>; response: { token: string; roomId: string; kioskId: string } };
  kioskHeartbeat: { request: Req<'kioskHeartbeat'>; response: { serverNow: number } };
  kioskStartPass: { request: Req<'kioskStartPass'>; response: { passId: string; serverNow: number } };
  kioskReturn: { request: Req<'kioskReturn'>; response: { ok: true; serverNow: number } };
}
export type EndpointName = keyof Endpoints;
