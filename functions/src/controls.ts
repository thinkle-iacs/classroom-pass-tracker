import { HttpsError } from 'firebase-functions/v2/https';
import { effectiveName, schoolClock, type Settings } from '@pass/shared';
import { mutateTeacherRoom, refs, type Ctx } from './room';

// Teacher live controls. Each one rebuilds the display in the same transaction.

const ok = { ok: true as const };

export function setPaused(ctx: Ctx, uid: string, input: { paused: boolean }) {
  return mutateTeacherRoom(ctx, uid, (loaded) => {
    loaded.room.paused = input.paused;
    return { result: ok };
  });
}

/** Pick a section by hand for today only. `null` goes back to the bell schedule. */
export function setSectionOverride(ctx: Ctx, uid: string, input: { sectionKey: string | null }) {
  return mutateTeacherRoom(ctx, uid, (loaded, _tx, nowMs) => {
    const { room, teacher } = loaded;
    if (input.sectionKey && !teacher.sections.some((s) => s.key === input.sectionKey)) throw new HttpsError('not-found', 'Class not found.');
    room.manualSectionKey = input.sectionKey;
    room.manualDateKey = input.sectionKey ? schoolClock(nowMs).dateKey : null;
    return { result: ok };
  });
}

export function updateSettings(ctx: Ctx, uid: string, input: { settings: Settings }) {
  return mutateTeacherRoom(ctx, uid, (loaded, tx) => {
    loaded.teacher.settings = input.settings;
    return { result: ok, write: () => tx.update(refs(ctx.db).teacher(uid), { settings: input.settings }) };
  });
}

/** Override a student's kiosk name. Empty or null restores the default. */
export function setDisplayName(ctx: Ctx, uid: string, input: { appStudentId: string; displayName: string | null }) {
  return mutateTeacherRoom(ctx, uid, async (loaded, tx) => {
    const ref = refs(ctx.db).student(uid, input.appStudentId);
    const student = (await tx.get(ref)).data();
    if (!student) throw new HttpsError('not-found', 'That student is not on your roster.');
    const displayNameOverride = input.displayName?.trim() || null;
    loaded.studentEdits = new Map([[input.appStudentId, { ...student, displayNameOverride }]]);
    return {
      result: { displayName: effectiveName({ ...student, displayNameOverride }) },
      write: () => tx.update(ref, { displayNameOverride }),
    };
  });
}
