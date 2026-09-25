// Parse Aspen OneRoster `periods` strings into weekday/period meetings.
// Ported from chromebook-signout-app parseScheduleFromSIS, but keyed per section
// rather than per student, and returning structured meetings rather than titles.
//
//   Middle school: "BLOCK 3(Mon-Tues) BLOCK 6(Thur-Fri)", "WIN(Mon-Tues,Thur-Fri)"
//   High school:   "Block 2(D1,D3)", "Adv/L 1(D1-D5)"  (D1..D5 = Mon..Fri)

export interface Meeting { day: number; periodId: string }

const MS_DAYS = ['Mon', 'Tues', 'Wed', 'Thur', 'Fri'];
const MS_NAMED: Record<string, string> = { Adv: 'adv', WIN: 'win', LUNCH: 'lunch', RECESS: 'recess' };

function expandRange(expr: string, order: string[]): number[] {
  const out: number[] = [];
  for (const part of expr.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [startRaw, endRaw] = part.split('-').map((p) => p.trim());
    const start = order.indexOf(startRaw ?? '');
    const end = endRaw === undefined ? start : order.indexOf(endRaw);
    if (start === -1 || end === -1) continue;
    for (let i = start; i <= end; i++) out.push(i + 1); // 1 = Monday
  }
  return out;
}

const HS_DAYS = ['D1', 'D2', 'D3', 'D4', 'D5'];

export function parseMeetings(periods: readonly string[] | null | undefined): Meeting[] {
  const found = new Map<string, Meeting>();
  const add = (day: number, periodId: string) => found.set(`${day}:${periodId}`, { day, periodId });
  for (const text of periods ?? []) {
    for (const m of text.matchAll(/BLOCK (\d+)\(([^)]+)\)/g)) {
      for (const day of expandRange(m[2]!, MS_DAYS)) add(day, `block_${m[1]}`);
    }
    for (const [label, id] of Object.entries(MS_NAMED)) {
      for (const m of text.matchAll(new RegExp(`\\b${label}\\(([^)]+)\\)`, 'g'))) {
        for (const day of expandRange(m[1]!, MS_DAYS)) add(day, id);
      }
    }
    for (const m of text.matchAll(/Block (\d+)\(([^)]+)\)/g)) {
      for (const day of expandRange(m[2]!, HS_DAYS)) add(day, `block_${m[1]}`);
    }
    for (const m of text.matchAll(/Adv\/L (\d+)\(([^)]+)\)/g)) {
      for (const day of expandRange(m[2]!, HS_DAYS)) add(day, `adv_l_${m[1]}`);
    }
  }
  return [...found.values()].sort((a, b) => a.day - b.day || a.periodId.localeCompare(b.periodId));
}
