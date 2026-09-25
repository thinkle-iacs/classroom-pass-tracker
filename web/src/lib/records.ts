// Firestore docs → plain millis for the shared analytics/export helpers.
import type { PassDoc, PassRecord } from '@pass/shared';

export interface Millis { toMillis(): number }
export type PassRow = PassRecord & { needsReview: boolean; sectionKey: string; corrections: number };

export function toPassRow(p: PassDoc<Millis> & { id: string }): PassRow {
  return {
    id: p.id, appStudentId: p.appStudentId, studentName: p.studentName, sectionTitle: p.sectionTitle, sectionKey: p.sectionKey,
    departedAt: p.departedAt.toMillis(), returnedAt: p.returnedAt?.toMillis() ?? null, status: p.status,
    needsReview: p.needsReview, corrections: p.corrections.length,
  };
}

const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
export const formatTime = (ms: number) => time.format(ms);
export const formatDay = (ms: number) => day.format(ms);
