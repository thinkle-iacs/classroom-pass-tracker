import { describe, expect, it } from 'vitest';
import { classRhythm, type PassRecord } from './passes';

const M = 60_000;
const pass = (id: string, from: number, to: number | null, status: PassRecord['status'] = 'completed'): PassRecord =>
  ({ id, appStudentId: id, studentName: id, sectionTitle: 'English 10', departedAt: from * M, returnedAt: to == null ? null : to * M, status });

describe('classRhythm', () => {
  it('alternates together and out, and totals both', () => {
    const r = classRhythm([pass('a', 10, 16), pass('b', 40, 45), pass('x', 20, 30, 'invalidated')], 0, 80 * M);
    expect(r.segments.map((s) => [s.kind, s.start / M, s.end / M])).toEqual([
      ['together', 0, 10], ['out', 10, 16], ['together', 16, 40], ['out', 40, 45], ['together', 45, 80],
    ]);
    expect(r.outMs).toBe(11 * M);
    expect(r.togetherMs).toBe(69 * M);
  });
  it('clips to the window, runs open passes to now, merges overlaps', () => {
    const r = classRhythm([pass('a', -5, 5), pass('b', 50, null), pass('c', 52, 58)], 0, 80 * M, 60 * M);
    expect(r.segments.map((s) => [s.kind, s.start / M, s.end / M, s.studentName])).toEqual([
      ['out', 0, 5, 'a'], ['together', 5, 50, undefined], ['out', 50, 60, 'b, c'], ['together', 60, 80, undefined],
    ]);
  });
});
