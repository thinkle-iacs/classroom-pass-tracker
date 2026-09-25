import { describe, expect, it } from 'vitest';
import { bellScheduleForGrades, HIGH_SCHOOL_SCHEDULE, parseMeetings, periodsForDay, resolveCurrentBlock, schoolClock } from '.';

// Helper: a Date for a school-local wall time. Sept 2026 is EDT (UTC-4).
const at = (iso: string) => new Date(`${iso}-04:00`);

describe('parseMeetings', () => {
  it('parses middle school rotating slots', () => {
    expect(parseMeetings(['BLOCK 3(Mon-Tues) BLOCK 6(Thur-Fri)'])).toEqual([
      { day: 1, periodId: 'block_3' }, { day: 2, periodId: 'block_3' },
      { day: 4, periodId: 'block_6' }, { day: 5, periodId: 'block_6' },
    ]);
  });
  it('parses middle school named periods with split ranges', () => {
    expect(parseMeetings(['WIN(Mon-Tues,Thur-Fri)']).map((m) => m.day)).toEqual([1, 2, 4, 5]);
  });
  it('parses high school cycle days', () => {
    expect(parseMeetings(['Block 2(D1,D3)'])).toEqual([{ day: 1, periodId: 'block_2' }, { day: 3, periodId: 'block_2' }]);
    expect(parseMeetings(['Adv/L 1(D1-D5)'])).toHaveLength(5);
  });
  it('does not confuse MS "BLOCK" and HS "Block"', () => {
    expect(parseMeetings(['Block 3(D2)'])).toEqual([{ day: 2, periodId: 'block_3' }]);
  });
  it('tolerates null and junk', () => {
    expect(parseMeetings(null)).toEqual([]);
    expect(parseMeetings(['nonsense'])).toEqual([]);
  });
});

describe('bell schedules', () => {
  it('HS Wednesday has no fourth block', () => {
    expect(periodsForDay(HIGH_SCHOOL_SCHEDULE, 3).some((p) => p.id === 'block_4')).toBe(false);
    expect(periodsForDay(HIGH_SCHOOL_SCHEDULE, 4).some((p) => p.id === 'block_4')).toBe(true);
  });
  it('picks MS grade schedules and defaults to HS', () => {
    expect(bellScheduleForGrades(['7']).name).toBe('ms_grade_07');
    expect(bellScheduleForGrades(['10']).name).toBe('high_school');
    expect(bellScheduleForGrades([]).name).toBe('high_school');
  });
});

describe('schoolClock', () => {
  it('uses the school timezone regardless of host timezone', () => {
    const c = schoolClock(new Date('2026-09-25T12:30:00Z')); // 8:30 EDT, Friday
    expect(c.day).toBe(5);
    expect(Math.floor(c.minutes)).toBe(8 * 60 + 30);
    expect(c.dateKey).toBe('2026-09-25');
  });
  it('dateKey rolls at local midnight, not UTC', () => {
    expect(schoolClock(new Date('2026-09-26T02:00:00Z')).dateKey).toBe('2026-09-25');
  });
});

describe('resolveCurrentBlock', () => {
  const sections = [
    { key: 'eng-b1', grades: ['10'], meetings: parseMeetings(['Block 1(D1,D2,D4,D5)']) },
    { key: 'jour-b3', grades: ['11'], meetings: parseMeetings(['Block 3(D1,D2,D3,D4)']) },
    { key: 'ela7', grades: ['07'], meetings: parseMeetings(['BLOCK 3(Mon-Tues) BLOCK 6(Thur-Fri)']) },
  ];
  it('finds the meeting section', () => {
    const b = resolveCurrentBlock(sections, at('2026-09-21T08:30:00')); // Monday
    expect(b?.sectionKey).toBe('eng-b1');
    expect(b?.label).toBe('A Block');
  });
  it('shows the next section during passing time', () => {
    expect(resolveCurrentBlock(sections, at('2026-09-21T11:03:00'))?.sectionKey).toBe('jour-b3');
  });
  it('uses the MS grade schedule for MS sections', () => {
    const b = resolveCurrentBlock(sections, at('2026-09-24T14:00:00')); // Thursday, MS slot 6
    expect(b?.sectionKey).toBe('ela7');
    expect(b?.label).toBe('C Block');
  });
  it('returns null outside class and on weekends', () => {
    expect(resolveCurrentBlock(sections, at('2026-09-21T16:00:00'))).toBeNull();
    expect(resolveCurrentBlock(sections, at('2026-09-26T09:00:00'))).toBeNull();
  });
});
