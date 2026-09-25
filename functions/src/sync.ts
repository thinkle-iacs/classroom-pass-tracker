import { Timestamp, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { defaultDisplayNames, parseMeetings, type RosterStudentDoc, type SectionDoc, type SectionSummary } from '@pass/shared';
import type { Principal } from './auth';
import { appStudentIds, sectionKeyFor } from './identity';
import { ensureTeacher, refreshRoom, refs, type Ctx } from './room';
import { isActive, type SisSource, type SisStudent } from './sis';

// Aspen -> teachers/{uid}/{sections,students}. Aspen ids stay on this side of
// identity.ts: sections keep aspenClassId (teacher-only), students get app ids.

/** Commits every `size` ops so a big roster stays under Firestore's 500-op batch limit. */
class ChunkedBatch {
  private batch: WriteBatch;
  private ops = 0;
  private readonly pending: Promise<unknown>[] = [];
  constructor(private readonly db: Firestore, private readonly size = 400) { this.batch = db.batch(); }
  add(fn: (b: WriteBatch) => void) {
    fn(this.batch);
    if (++this.ops >= this.size) this.flush();
  }
  private flush() {
    if (this.ops) this.pending.push(this.batch.commit());
    this.batch = this.db.batch();
    this.ops = 0;
  }
  async done() { this.flush(); await Promise.all(this.pending); }
}

const isStudent = (s: SisStudent) => isActive(s) && (s.role === undefined || s.role === 'student');

export async function syncRoster(ctx: Ctx, principal: Principal, sis: SisSource): Promise<{ sections: number; students: number }> {
  const teacher = await ensureTeacher(ctx, principal);
  const r = refs(ctx.db);
  const uid = principal.uid;

  const classes = (await sis.classesForTeacher(principal.email)).filter(isActive);
  const rosters = await Promise.all(classes.map(async (c) => ({ c, students: (await sis.students(c.sourcedId)).filter(isStudent) })));
  const ids = await appStudentIds(ctx.db, rosters.flatMap((x) => x.students.map((s) => s.sourcedId)));

  // One entry per app student across all of the teacher's sections.
  const people = new Map<string, { givenName: string; familyName: string; sectionKeys: string[] }>();
  const sections = rosters.map(({ c, students }) => {
    const key = sectionKeyFor(c.sourcedId);
    const studentIds = [...new Set(students.map((s) => ids.get(s.sourcedId)!))];
    for (const s of students) {
      const id = ids.get(s.sourcedId)!;
      const p = people.get(id) ?? { givenName: s.givenName, familyName: s.familyName, sectionKeys: [] };
      if (!p.sectionKeys.includes(key)) p.sectionKeys.push(key);
      people.set(id, p);
    }
    return { key, c, studentIds, meetings: parseMeetings(c.periods) };
  });
  const names = defaultDisplayNames([...people].map(([id, p]) => ({ id, givenName: p.givenName, familyName: p.familyName })));

  const [existingStudents, existingSections] = await Promise.all([
    r.teacher(uid).collection('students').select('displayNameOverride').get(),
    r.teacher(uid).collection('sections').select().get(),
  ]);
  const known = new Set(existingStudents.docs.map((d) => d.id));
  const now = Timestamp.fromMillis(ctx.now());
  const batch = new ChunkedBatch(ctx.db);

  for (const [id, p] of people) {
    const fields: Partial<RosterStudentDoc> = {
      givenName: p.givenName, familyName: p.familyName, defaultDisplayName: names.get(id)!, sectionKeys: p.sectionKeys,
    };
    // Merge, and never send displayNameOverride for a known student: the teacher's override survives every re-sync.
    if (!known.has(id)) fields.displayNameOverride = null;
    batch.add((b) => b.set(r.student(uid, id), fields, { merge: true }));
  }
  // Students who left every section keep their doc (old passes point at it) but drop off rosters.
  for (const doc of existingStudents.docs) {
    if (!people.has(doc.id)) batch.add((b) => b.set(doc.ref, { sectionKeys: [] }, { merge: true }));
  }
  const keep = new Set(sections.map((s) => s.key));
  for (const s of sections) {
    const section: SectionDoc<Timestamp> = {
      title: s.c.title, classCode: s.c.classCode ?? null, grades: s.c.grades ?? [], periods: s.c.periods ?? [],
      meetings: s.meetings, studentIds: s.studentIds, aspenClassId: s.c.sourcedId, syncedAt: now,
    };
    batch.add((b) => b.set(r.section(uid, s.key), section));
  }
  for (const doc of existingSections.docs) if (!keep.has(doc.id)) batch.add((b) => b.delete(doc.ref));
  const summary: SectionSummary[] = sections.map((s) => ({ key: s.key, title: s.c.title, grades: s.c.grades ?? [], meetings: s.meetings }));
  batch.add((b) => b.update(r.teacher(uid), { sections: summary, lastSyncAt: now, email: principal.email, name: principal.name }));
  await batch.done();

  // New salt: kiosk keys from before this sync stop matching anyone.
  await refreshRoom(ctx, teacher.roomId, { force: true, rotateSalt: true });
  return { sections: sections.length, students: people.size };
}
