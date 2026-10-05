import { bellScheduleForGrades, periodsForDay, toMinutes, type BellPeriod } from './bells';
import { schoolClock, SCHOOL_TIME_ZONE } from './clock';
import type { Meeting } from './periods';

export interface SchedulableSection { key: string; grades?: readonly string[] | null; meetings: readonly Meeting[] }

export interface CurrentBlock {
  /** The first meeting section by key. */
  sectionKey: string;
  /** Every section meeting in this block (sorted by key), so their rosters can be combined. */
  sectionKeys: string[];
  periodId: string;
  label: string;
  /** School-local minutes since midnight. */
  startMinutes: number;
  endMinutes: number;
  dateKey: string;
}

/** Minutes before a block starts that we already show its roster (passing time). */
export const LEAD_MINUTES = 10;

/**
 * Which of a teacher's sections is meeting now (or starting within LEAD_MINUTES)?
 * Returns null outside class time. When several sections meet in the same block
 * (same start and end, e.g. two classes taught together), they are all returned
 * in `sectionKeys` so the room can show a combined roster.
 */
export function resolveCurrentBlock(sections: readonly SchedulableSection[], now: Date | number, timeZone = SCHOOL_TIME_ZONE): CurrentBlock | null {
  const clock = schoolClock(now, timeZone);
  const candidates: { key: string; period: BellPeriod; start: number; end: number; distance: number }[] = [];
  for (const section of [...sections].sort((a, b) => a.key.localeCompare(b.key))) {
    const periods = periodsForDay(bellScheduleForGrades(section.grades), clock.day);
    for (const meeting of section.meetings) {
      if (meeting.day !== clock.day) continue;
      const p: BellPeriod | undefined = periods.find((x) => x.id === meeting.periodId);
      if (!p || p.structural) continue;
      const start = toMinutes(p.startTime);
      const end = toMinutes(p.endTime);
      if (clock.minutes >= end || clock.minutes < start - LEAD_MINUTES) continue;
      const distance = clock.minutes >= start ? 0 : start - clock.minutes;
      candidates.push({ key: section.key, period: p, start, end, distance });
    }
  }
  let best: (typeof candidates)[number] | undefined;
  for (const c of candidates) if (!best || c.distance < best.distance) best = c;
  if (!best) return null;
  const sectionKeys = [...new Set(candidates.filter((c) => c.start === best.start && c.end === best.end).map((c) => c.key))];
  return {
    sectionKey: best.key, sectionKeys, periodId: best.period.id, label: best.period.displayName,
    startMinutes: best.start, endMinutes: best.end, dateKey: clock.dateKey,
  };
}
