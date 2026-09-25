// Bell schedules, 2026-2027.
//
// Ported from chromebook-signout-app/src/ui/scheduling (bellSchedules.ts and
// msSchedules.ts, Sept 2026), which in turn follows the IACS start page extension.
// Period ids match what the Aspen `periods` parser produces ("block_1".."block_6",
// "adv", "win", "lunch", "recess", "brunch", "adv_l_1", "adv_l_2"), so a section
// meets a bell period when its parsed meeting has the same weekday and id.
//
// Letters are display-only. Matching never depends on them, because Aspen names
// numbered slots and the letter rotation lives in the day structure.

export interface BellPeriod {
  id: string;
  displayName: string;
  startTime: string; // "08:05", school-local
  endTime: string;
  /** Periods like lunch/advisory are part of the day, not a class to track passes for. */
  structural?: boolean;
}

export interface DaySchedule { days: number[] /* 0=Sun..6 */; periods: BellPeriod[] }
export interface BellSchedule { name: string; grades: string[]; schedules: DaySchedule[] }

function period(id: string, displayName: string, startTime: string, endTime: string, structural = false): BellPeriod {
  return structural ? { id, displayName, startTime, endTime, structural } : { id, displayName, startTime, endTime };
}

// ---------------------------------------------------------------- High School
// Same block times every weekday. Wednesday is a short day with no fourth block.
// Aspen's "Block 2(D1,D3)" strings say which block number meets on which day.
//
// Letters per day come from the extension's hs_schedule.ts (last touched Aug 2024)
// and are UNVERIFIED for 2026-27; they only affect labels on screen.
const HS_LETTERS: Record<number, string[]> = {
  1: ['A', 'B', 'C', 'D'],
  2: ['B', 'C', 'E', 'F'],
  3: ['D', 'F', 'A'],
  4: ['C', 'B', 'E', 'A'],
  5: ['F', 'E', 'D', 'Flex'],
};

function hsDay(day: number): BellPeriod[] {
  const letters = HS_LETTERS[day] ?? [];
  const block = (n: number, start: string, end: string) =>
    period(`block_${n}`, letters[n - 1] ? `${letters[n - 1]} Block` : `Block ${n}`, start, end);
  const periods = [
    block(1, '08:05', '09:27'),
    block(2, '09:40', '11:02'),
    block(3, '11:05', '12:27'),
    period('adv_l_1', 'Adv/Lunch 1', '12:30', '12:54', true),
    period('adv_l_2', 'Adv/Lunch 2', '12:55', '13:19', true),
  ];
  // TODO(verify): Wednesday's exact end time. Tom recalls ~12:40; the extension shows Adv/L running to 13:19.
  if (day !== 3) periods.push(block(4, '13:22', '14:45'));
  return periods;
}

export const HIGH_SCHOOL_SCHEDULE: BellSchedule = {
  name: 'high_school',
  grades: ['09', '10', '11', '12'],
  schedules: [1, 2, 3, 4, 5].map((day) => ({ days: [day], periods: hsDay(day) })),
};

// -------------------------------------------------------------- Middle School
// Six slots Mon/Tue/Thu/Fri. Letters rotate: Mon/Tue run A-F, Thu/Fri run D,E,F,A,B,C.
// Wednesday is a shorter, grade-specific day with five unlettered slots and Brunch.
export type MSGrade = '05' | '06' | '07' | '08';
export const MS_GRADES: MSGrade[] = ['05', '06', '07', '08'];
const MON_TUE_LETTERS = 'ABCDEF';
const THU_FRI_LETTERS = 'DEFABC';

function middleOfDay(grade: MSGrade): BellPeriod[] {
  const lunch = (s: string, e: string) => period('lunch', 'Lunch', s, e, true);
  const recess = (s: string, e: string) => period('recess', 'Recess', s, e, true);
  const win = (s: string, e: string) => period('win', 'WIN', s, e, true);
  switch (grade) {
    case '05': return [lunch('11:03', '11:23'), recess('11:23', '11:40'), win('11:41', '12:18')];
    case '06': return [recess('11:03', '11:20'), lunch('11:20', '11:40'), win('11:41', '12:18')];
    case '07': return [win('11:03', '11:40'), lunch('11:41', '12:01'), recess('12:01', '12:18')];
    case '08': return [win('11:03', '11:40'), recess('11:41', '11:58'), lunch('11:58', '12:18')];
  }
}

function standardDay(grade: MSGrade, letters: string): BellPeriod[] {
  const slot = (n: number, s: string, e: string) => period(`block_${n}`, `${letters[n - 1]} Block`, s, e);
  return [
    period('adv', 'Advisory', '08:05', '08:35', true),
    slot(1, '08:36', '09:24'), slot(2, '09:25', '10:13'), slot(3, '10:14', '11:02'),
    ...middleOfDay(grade),
    slot(4, '12:19', '13:07'), slot(5, '13:08', '13:56'), slot(6, '13:57', '14:45'),
  ];
}

function wednesday(grade: MSGrade): BellPeriod[] {
  const b = (n: number, s: string, e: string) => period(`block_${n}`, `Block ${n}`, s, e);
  const brunch = (s: string, e: string) => period('brunch', 'Brunch', s, e, true);
  switch (grade) {
    case '05': return [b(1, '08:05', '08:53'), b(2, '08:55', '09:43'), brunch('09:45', '10:05'), b(3, '10:05', '10:52'), b(4, '10:53', '11:58'), b(5, '12:02', '12:45')];
    case '06': return [b(1, '08:05', '08:53'), b(2, '08:55', '09:43'), b(3, '09:45', '10:32'), brunch('10:32', '10:52'), b(4, '10:53', '11:58'), b(5, '12:02', '12:45')];
    case '07': return [b(1, '08:05', '09:10'), b(2, '09:12', '10:00'), b(3, '10:02', '10:51'), brunch('10:53', '11:13'), b(4, '11:13', '12:00'), b(5, '12:02', '12:45')];
    case '08': return [b(1, '08:05', '09:10'), b(2, '09:12', '10:00'), b(3, '10:02', '10:51'), b(4, '10:53', '11:40'), brunch('11:40', '12:00'), b(5, '12:02', '12:45')];
  }
}

function msSchedule(grade: MSGrade): BellSchedule {
  return {
    name: `ms_grade_${grade}`,
    grades: [grade],
    schedules: [
      { days: [1, 2], periods: standardDay(grade, MON_TUE_LETTERS) },
      { days: [3], periods: wednesday(grade) },
      { days: [4, 5], periods: standardDay(grade, THU_FRI_LETTERS) },
    ],
  };
}

export const ALL_SCHEDULES: BellSchedule[] = [HIGH_SCHOOL_SCHEDULE, ...MS_GRADES.map(msSchedule)];

/** Pick a bell schedule from a section's OneRoster `grades` (e.g. ["07"]). Defaults to HS. */
export function bellScheduleForGrades(grades: readonly string[] | null | undefined): BellSchedule {
  for (const grade of grades ?? []) {
    const padded = grade.padStart(2, '0');
    const match = ALL_SCHEDULES.find((s) => s.grades.includes(padded));
    if (match) return match;
  }
  return HIGH_SCHOOL_SCHEDULE;
}

export function periodsForDay(schedule: BellSchedule, day: number): BellPeriod[] {
  return schedule.schedules.find((s) => s.days.includes(day))?.periods ?? [];
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
