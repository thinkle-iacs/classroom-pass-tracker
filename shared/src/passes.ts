import type { Settings } from './model';

export type Escalation = 'normal' | 'warning' | 'critical';

export function escalation(elapsedMs: number, settings: Pick<Settings, 'warningAfterMinutes' | 'attendanceThresholdMinutes'>): Escalation {
  const minutes = elapsedMs / 60000;
  if (minutes >= settings.attendanceThresholdMinutes) return 'critical';
  if (minutes >= settings.warningAfterMinutes) return 'warning';
  return 'normal';
}

/** "4:38", or "1:04:38" past an hour. Never negative (clock skew). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export type Unavailable = 'paused' | 'no-class' | 'start-of-class' | 'end-of-class';
export interface Availability { allowed: boolean; reason: Unavailable | null }

export interface AvailabilityInput {
  paused: boolean;
  /** The block being displayed. `null` means no class is selected. */
  block: { startMinutes: number; endMinutes: number } | null;
  /** True when the teacher picked the section by hand: skip time-window rules. */
  manual: boolean;
  nowMinutes: number;
  settings: Pick<Settings, 'noPassFirstMinutes' | 'noPassLastMinutes'>;
}

/** Can a *new* pass start? Returning is always allowed and never consults this. */
export function availability({ paused, block, manual, nowMinutes, settings }: AvailabilityInput): Availability {
  if (paused) return { allowed: false, reason: 'paused' };
  if (manual) return { allowed: true, reason: null };
  if (!block) return { allowed: false, reason: 'no-class' };
  if (nowMinutes < block.startMinutes + settings.noPassFirstMinutes) return { allowed: false, reason: 'start-of-class' };
  if (nowMinutes >= block.endMinutes - settings.noPassLastMinutes) return { allowed: false, reason: 'end-of-class' };
  return { allowed: true, reason: null };
}

export const UNAVAILABLE_MESSAGE: Record<Unavailable, string> = {
  'paused': 'Passes are paused right now',
  'no-class': 'No class is in session',
  'start-of-class': 'Passes open a few minutes into class',
  'end-of-class': 'No new passes at the end of class',
};

// ------------------------------------------------------------------ analytics

export interface PassRecord {
  id: string;
  appStudentId: string;
  studentName: string;
  sectionTitle: string;
  departedAt: number;
  returnedAt: number | null;
  status: 'active' | 'completed' | 'invalidated';
}

export function durationMs(p: Pick<PassRecord, 'departedAt' | 'returnedAt'>, now = Date.now()): number {
  return Math.max(0, (p.returnedAt ?? now) - p.departedAt);
}

export interface StudentSummary {
  appStudentId: string;
  studentName: string;
  passes: number;
  totalMinutes: number;
  averageMinutes: number;
  overWarning: number;
  overThreshold: number;
}

/** Aggregate completed passes per student. Invalidated and still-active passes are excluded. */
export function summarizeByStudent(passes: readonly PassRecord[], settings: Pick<Settings, 'warningAfterMinutes' | 'attendanceThresholdMinutes'>): StudentSummary[] {
  const by = new Map<string, StudentSummary>();
  for (const p of passes) {
    if (p.status !== 'completed' || p.returnedAt == null) continue;
    const minutes = durationMs(p) / 60000;
    const s = by.get(p.appStudentId) ?? { appStudentId: p.appStudentId, studentName: p.studentName, passes: 0, totalMinutes: 0, averageMinutes: 0, overWarning: 0, overThreshold: 0 };
    s.passes += 1;
    s.totalMinutes += minutes;
    if (minutes >= settings.warningAfterMinutes) s.overWarning += 1;
    if (minutes >= settings.attendanceThresholdMinutes) s.overThreshold += 1;
    by.set(p.appStudentId, s);
  }
  return [...by.values()]
    .map((s) => ({ ...s, averageMinutes: s.totalMinutes / s.passes }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

// ---------------------------------------------------------------- TSV export

const tsvCell = (v: string) => v.replace(/[\t\r\n]+/g, ' ');

export function passesToTsv(passes: readonly PassRecord[], settings: Pick<Settings, 'warningAfterMinutes' | 'attendanceThresholdMinutes'>, timeZone = 'America/New_York'): string {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const header = ['Date', 'Student', 'Class', 'Departure', 'Return', 'Duration (minutes)', 'Warning threshold reached', 'Attendance threshold reached', 'Status'];
  const rows = [...passes].sort((a, b) => a.departedAt - b.departedAt).map((p) => {
    const minutes = p.returnedAt == null ? null : durationMs(p) / 60000;
    return [
      date.format(p.departedAt), p.studentName, p.sectionTitle, time.format(p.departedAt),
      p.returnedAt == null ? '' : time.format(p.returnedAt),
      minutes == null ? '' : minutes.toFixed(1),
      minutes == null ? '' : minutes >= settings.warningAfterMinutes ? 'Yes' : 'No',
      minutes == null ? '' : minutes >= settings.attendanceThresholdMinutes ? 'Yes' : 'No',
      p.status,
    ].map(tsvCell).join('\t');
  });
  return [header.join('\t'), ...rows].join('\n');
}
