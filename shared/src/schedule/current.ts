import { bellScheduleForGrades, periodsForDay, toMinutes, type BellPeriod } from './bells';
import { schoolClock, SCHOOL_TIME_ZONE } from './clock';
import type { Meeting } from './periods';

export interface SchedulableSection { key: string; grades?: readonly string[] | null; meetings: readonly Meeting[] }

export interface CurrentBlock {
  sectionKey: string;
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
 * Returns null outside class time. If two sections match (e.g. a cross-listed
 * pair in Aspen), the first by key wins; the teacher can override.
 */
export function resolveCurrentBlock(sections: readonly SchedulableSection[], now: Date | number, timeZone = SCHOOL_TIME_ZONE): CurrentBlock | null {
  const clock = schoolClock(now, timeZone);
  let best: { block: CurrentBlock; distance: number } | null = null;
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
      if (!best || distance < best.distance) {
        best = { distance, block: { sectionKey: section.key, periodId: p.id, label: p.displayName, startMinutes: start, endMinutes: end, dateKey: clock.dateKey } };
      }
    }
  }
  return best?.block ?? null;
}
