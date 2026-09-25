import { describe, expect, it } from 'vitest';
import { availability, escalation, formatElapsed, passesToTsv, summarizeByStudent, type PassRecord } from './passes';
import { DEFAULT_SETTINGS } from './model';

const MIN = 60000;

describe('escalation', () => {
  it('escalates at 5 and 15 minutes by default', () => {
    expect(escalation(4.9 * MIN, DEFAULT_SETTINGS)).toBe('normal');
    expect(escalation(5 * MIN, DEFAULT_SETTINGS)).toBe('warning');
    expect(escalation(15 * MIN, DEFAULT_SETTINGS)).toBe('critical');
  });
});

describe('formatElapsed', () => {
  it('formats and clamps', () => {
    expect(formatElapsed(278000)).toBe('4:38');
    expect(formatElapsed(3878000)).toBe('1:04:38');
    expect(formatElapsed(-5000)).toBe('0:00');
  });
});

describe('availability', () => {
  const block = { startMinutes: 485, endMinutes: 567 }; // 8:05-9:27
  const base = { paused: false, block, manual: false, settings: DEFAULT_SETTINGS };
  it('blocks the first and last N minutes', () => {
    expect(availability({ ...base, nowMinutes: 490 }).reason).toBe('start-of-class');
    expect(availability({ ...base, nowMinutes: 520 }).allowed).toBe(true);
    expect(availability({ ...base, nowMinutes: 560 }).reason).toBe('end-of-class');
  });
  it('pause wins, manual skips the time windows', () => {
    expect(availability({ ...base, paused: true, nowMinutes: 520 }).reason).toBe('paused');
    expect(availability({ ...base, manual: true, block: null, nowMinutes: 0 }).allowed).toBe(true);
  });
  it('no class, no passes', () => {
    expect(availability({ ...base, block: null, nowMinutes: 520 }).reason).toBe('no-class');
  });
});

const pass = (over: Partial<PassRecord>): PassRecord => ({
  id: 'p', appStudentId: 's1', studentName: 'Maya R.', sectionTitle: 'English 10',
  departedAt: Date.UTC(2026, 8, 21, 12, 30), returnedAt: Date.UTC(2026, 8, 21, 12, 37), status: 'completed', ...over,
});

describe('summaries and export', () => {
  it('summarizes completed passes only', () => {
    const [s] = summarizeByStudent([
      pass({ id: '1' }),
      pass({ id: '2', returnedAt: Date.UTC(2026, 8, 21, 12, 50) }),
      pass({ id: '3', status: 'invalidated' }),
      pass({ id: '4', status: 'active', returnedAt: null }),
    ], DEFAULT_SETTINGS);
    expect(s).toMatchObject({ passes: 2, totalMinutes: 27, overWarning: 2, overThreshold: 1 });
  });
  it('produces TSV in school-local time', () => {
    const tsv = passesToTsv([pass({})], DEFAULT_SETTINGS).split('\n');
    expect(tsv[0]!.split('\t')).toHaveLength(9);
    expect(tsv[1]).toBe(['2026-09-21', 'Maya R.', 'English 10', '8:30:00 AM', '8:37:00 AM', '7.0', 'Yes', 'No', 'completed'].join('\t'));
  });
});
