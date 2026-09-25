import { FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  DEFAULT_SETTINGS, effectiveName, resolveCurrentBlock, schoolClock,
  type CurrentSection, type DisplayDoc, type RoomDoc, type RosterStudentDoc, type SectionDoc, type TeacherDoc,
} from '@pass/shared';
import { kioskKey, newOpaqueId } from './identity';

// Room state: the private rooms/{roomId} doc and its kiosk-safe projection
// displays/{roomId}. Every module takes a Ctx so tests can pin the clock.

export interface Ctx { db: Firestore; now: () => number }
export const systemCtx = (db: Firestore): Ctx => ({ db, now: Date.now });

export type Room = RoomDoc<Timestamp>;
export type Teacher = TeacherDoc<Timestamp>;
export type Display = DisplayDoc<Timestamp>;

/** An active pass older than this, or from an earlier school day, needs the teacher. */
export const STALE_PASS_MS = 4 * 60 * 60 * 1000;

export const refs = (db: Firestore) => ({
  teacher: (uid: string) => db.doc(`teachers/${uid}`) as DocumentReference<Teacher>,
  section: (uid: string, key: string) => db.doc(`teachers/${uid}/sections/${key}`) as DocumentReference<SectionDoc<Timestamp>>,
  student: (uid: string, id: string) => db.doc(`teachers/${uid}/students/${id}`) as DocumentReference<RosterStudentDoc>,
  room: (roomId: string) => db.doc(`rooms/${roomId}`) as DocumentReference<Room>,
  display: (roomId: string) => db.doc(`displays/${roomId}`) as DocumentReference<Display>,
  kiosk: (kioskId: string) => db.doc(`kiosks/${kioskId}`),
  pass: (passId: string) => db.doc(`passes/${passId}`),
});

// ------------------------------------------------------------------ teachers

/** Create teachers/{uid}, rooms/{roomId} and an empty display on first use. */
export async function ensureTeacher(ctx: Ctx, principal: { uid: string; email: string; name: string }): Promise<Teacher> {
  const r = refs(ctx.db);
  return ctx.db.runTransaction(async (tx) => {
    const snap = await tx.get(r.teacher(principal.uid));
    if (snap.exists) return snap.data()!;
    const now = Timestamp.fromMillis(ctx.now());
    const teacher: Teacher = {
      email: principal.email, name: principal.name, roomId: newOpaqueId(), settings: DEFAULT_SETTINGS, lastSyncAt: null, sections: [],
    };
    const room: Room = {
      teacherUid: principal.uid, paused: false, manualSectionKey: null, manualDateKey: null, current: null,
      activePass: null, togetherSince: now, displaySalt: newOpaqueId(16), updatedAt: now,
    };
    tx.create(r.teacher(principal.uid), teacher);
    tx.create(r.room(teacher.roomId), room);
    tx.create(r.display(teacher.roomId), buildDisplay(room, teacher, null, new Map(), now));
    return teacher;
  });
}

export async function requireTeacher(tx: Transaction, db: Firestore, uid: string): Promise<Teacher> {
  const snap = await tx.get(refs(db).teacher(uid));
  if (!snap.exists) throw new HttpsError('failed-precondition', 'Load your classes from Aspen first.');
  return snap.data()!;
}

// -------------------------------------------------------------- current block

/** Which section should the room show now? Pure: teacher sections + room override + clock. */
export function computeCurrent(teacher: Pick<Teacher, 'sections'>, room: Pick<Room, 'manualSectionKey' | 'manualDateKey'>, nowMs: number): CurrentSection | null {
  const clock = schoolClock(nowMs);
  const at = (minutes: number) => Math.round(nowMs - (clock.minutes - minutes) * 60000);
  const scheduled = (sections: Teacher['sections']): CurrentSection | null => {
    const block = resolveCurrentBlock(sections, nowMs);
    if (!block) return null;
    return {
      sectionKey: block.sectionKey, label: block.label, startMinutes: block.startMinutes, endMinutes: block.endMinutes,
      startAt: at(block.startMinutes), endAt: at(block.endMinutes), dateKey: clock.dateKey, manual: false,
    };
  };
  const manual = room.manualDateKey === clock.dateKey ? teacher.sections.find((s) => s.key === room.manualSectionKey) : undefined;
  if (manual) {
    return scheduled([manual]) ?? { sectionKey: manual.key, label: null, startMinutes: null, endMinutes: null, startAt: null, endAt: null, dateKey: clock.dateKey, manual: true };
  }
  return scheduled(teacher.sections);
}

export function isStale(departedAt: Timestamp, nowMs: number): boolean {
  return nowMs - departedAt.toMillis() > STALE_PASS_MS || schoolClock(departedAt.toMillis()).dateKey !== schoolClock(nowMs).dateKey;
}

// ------------------------------------------------------------------- display

/** The kiosk-safe projection. Only display names and per-room HMAC keys leave here. */
export function buildDisplay(room: Room, teacher: Teacher, section: { title: string; studentIds: string[] } | null, students: ReadonlyMap<string, RosterStudentDoc>, now: Timestamp): Display {
  const current = room.current;
  const nameOf = (id: string) => { const s = students.get(id); return s ? effectiveName(s) : null; };
  const roster = (section?.studentIds ?? [])
    .flatMap((id) => { const name = nameOf(id); return name ? [{ k: kioskKey(room.displaySalt, id), name }] : []; })
    .sort((a, b) => a.name.localeCompare(b.name));
  const active = room.activePass;
  const hasBlock = current && current.startMinutes != null && current.endMinutes != null && current.startAt != null && current.endAt != null;
  return {
    sectionTitle: section?.title ?? null,
    blockLabel: current?.label ?? null,
    block: hasBlock ? { startMinutes: current.startMinutes!, endMinutes: current.endMinutes!, startAt: current.startAt!, endAt: current.endAt! } : null,
    manual: current?.manual ?? false,
    paused: room.paused,
    roster,
    active: active ? { k: kioskKey(room.displaySalt, active.appStudentId), name: nameOf(active.appStudentId) ?? 'A student', departedAt: active.departedAt } : null,
    togetherSince: room.togetherSince,
    settings: teacher.settings,
    updatedAt: now,
  };
}

// ------------------------------------------------------------- transactions
//
// Mutations follow one shape inside a transaction:
//   1. read what they need, including loadRoom()
//   2. change the room in memory and settle() it against the clock
//   3. commitRoom(), which does its last reads and then writes room + display
//   4. write anything else (passes). No reads after commitRoom.

export interface LoadedRoom {
  roomId: string; room: Room; teacher: Teacher; stalePassId: string | null;
  /** Student edits made in this transaction, applied over what commitRoom reads. */
  studentEdits?: Map<string, RosterStudentDoc>;
}

export async function loadRoom(tx: Transaction, db: Firestore, roomId: string): Promise<LoadedRoom> {
  const roomSnap = await tx.get(refs(db).room(roomId));
  if (!roomSnap.exists) throw new HttpsError('not-found', 'This classroom no longer exists.');
  const room = roomSnap.data()!;
  const teacherSnap = await tx.get(refs(db).teacher(room.teacherUid));
  if (!teacherSnap.exists) throw new HttpsError('not-found', 'This classroom no longer exists.');
  return { roomId, room, teacher: teacherSnap.data()!, stalePassId: null };
}

/** Recompute `current` and release a stale active pass. Returns true if anything changed. */
export function settle(loaded: LoadedRoom, nowMs: number): boolean {
  const { room } = loaded;
  const before = JSON.stringify(room.current);
  room.current = computeCurrent(loaded.teacher, room, nowMs);
  if (room.activePass && isStale(room.activePass.departedAt, nowMs)) {
    loaded.stalePassId = room.activePass.passId;
    room.activePass = null;
    room.togetherSince = Timestamp.fromMillis(nowMs);
  }
  return loaded.stalePassId !== null || JSON.stringify(room.current) !== before;
}

export async function commitRoom(tx: Transaction, db: Firestore, loaded: LoadedRoom, nowMs: number): Promise<void> {
  const r = refs(db);
  const { roomId, room, teacher } = loaded;
  const uid = room.teacherUid;
  const now = Timestamp.fromMillis(nowMs);
  const sectionSnap = room.current ? await tx.get(r.section(uid, room.current.sectionKey)) : null;
  const section = sectionSnap?.exists ? sectionSnap.data()! : null;
  const ids = [...new Set([...(section?.studentIds ?? []), ...(room.activePass ? [room.activePass.appStudentId] : [])])];
  const students = new Map<string, RosterStudentDoc>();
  if (ids.length) {
    const snaps = await tx.getAll(...ids.map((id) => r.student(uid, id)));
    snaps.forEach((s) => { if (s.exists) students.set(s.id, s.data()!); });
  }
  loaded.studentEdits?.forEach((s, id) => { if (students.has(id)) students.set(id, s); });
  room.updatedAt = now;
  tx.set(r.room(roomId), room);
  tx.set(r.display(roomId), buildDisplay(room, teacher, section, students, now));
  if (loaded.stalePassId) {
    tx.update(r.pass(loaded.stalePassId), {
      needsReview: true, updatedAt: now,
      corrections: FieldValue.arrayUnion({ at: now, by: 'system', action: 'flagged-stale', note: 'Still out after the class ended.', previous: {} }),
    });
  }
}

/** Heartbeats and syncs. Writes nothing when nothing changed, unless forced. */
export async function refreshRoom(ctx: Ctx, roomId: string, opts: { force?: boolean; rotateSalt?: boolean } = {}): Promise<boolean> {
  return ctx.db.runTransaction(async (tx) => {
    const nowMs = ctx.now();
    const loaded = await loadRoom(tx, ctx.db, roomId);
    const changed = settle(loaded, nowMs);
    if (opts.rotateSalt) loaded.room.displaySalt = newOpaqueId(16);
    if (!changed && !opts.force && !opts.rotateSalt) return false;
    await commitRoom(tx, ctx.db, loaded, nowMs);
    return true;
  });
}

/**
 * Run a teacher mutation on the teacher's own room, then rebuild the display.
 * `mutate` may read and change the room in memory (settle() runs after it, so
 * `current` reflects the change); other writes go in the
 * returned `write`, which runs after commitRoom (transactions read before writing).
 */
export async function mutateTeacherRoom<T>(
  ctx: Ctx, uid: string,
  mutate: (loaded: LoadedRoom, tx: Transaction, nowMs: number) => Promise<Mutation<T>> | Mutation<T>,
): Promise<T> {
  return ctx.db.runTransaction(async (tx) => {
    const nowMs = ctx.now();
    const teacher = await requireTeacher(tx, ctx.db, uid);
    const loaded = await loadRoom(tx, ctx.db, teacher.roomId);
    if (loaded.room.teacherUid !== uid) throw new HttpsError('permission-denied', 'Not your classroom.');
    const { result, write } = await mutate(loaded, tx, nowMs);
    settle(loaded, nowMs);
    await commitRoom(tx, ctx.db, loaded, nowMs);
    write?.(Timestamp.fromMillis(nowMs));
    return result;
  });
}
export interface Mutation<T> { result: T; write?: (now: Timestamp) => void }
