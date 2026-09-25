import { describe, expect, it } from 'vitest';
import { DRAWINGS, FULL_DRAWING_MS, koch, progressAt, sierpinski, stitching, traced, type Segment } from './drawings';

const inside = (segs: Segment[]) => segs.flat().every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);

describe('screensaver drawings', () => {
  it('Sierpinski adds 3^(g-1) inverted triangles per level', () => {
    expect(sierpinski(5).map((g) => g.length)).toEqual([3, 3, 9, 27, 81]);
  });
  it('Koch bumps point outward and grow by 4x', () => {
    const gens = koch(4);
    expect(gens.map((g) => g.length)).toEqual([3, 6, 24, 96]);
    const center = gens[0]!.flat().reduce(([x, y], p) => [x + p[0] / 6, y + p[1] / 6], [0, 0]);
    const dist = ([x, y]: readonly [number, number]) => Math.hypot(x - center[0], y - center[1]);
    for (const [s, apex] of gens[1]!.filter((_, i) => i % 2 === 0)) expect(dist(apex)).toBeGreaterThan(dist(s));
  });
  it('every drawing fits the unit square', () => {
    for (const make of Object.values(DRAWINGS)) expect(inside(make().flat())).toBe(true);
    expect(stitching()[1]).toHaveLength(12);
  });
  it('schedule starts at generation 0, grows slowly, and holds when done', () => {
    expect(progressAt(7, 0)).toEqual({ generation: 0, fraction: 0, done: false });
    const early = progressAt(7, 60_000);
    expect(early.generation).toBe(0); // the first triangle alone takes over a minute
    expect(progressAt(7, FULL_DRAWING_MS / 2).generation).toBeGreaterThan(2);
    expect(progressAt(7, FULL_DRAWING_MS + 1)).toMatchObject({ generation: 6, done: true });
  });
  it('traces by length, ending with a partial segment', () => {
    const gen: Segment[] = [[[0, 0], [1, 0]], [[1, 0], [1, 1]]];
    expect(traced(gen, 0.75)).toEqual([[[0, 0], [1, 0]], [[1, 0], [1, 0.5]]]);
    expect(traced(gen, 1)).toEqual(gen);
    expect(traced(gen, 0)).toEqual([]);
  });
});

describe('screensaver motion', () => {
  it('spins round shapes a full turn, rocks the rest gently', async () => {
    const { DRAWING_STYLE, motionAt } = await import('./drawings');
    const stitch = DRAWING_STYLE.stitching;
    expect(motionAt(stitch, stitch.spinMs! / 4).angle).toBeCloseTo(Math.PI / 2);
    for (let t = 0; t < 600_000; t += 7_000) {
      expect(Math.abs(motionAt(DRAWING_STYLE.tree, t).angle)).toBeLessThanOrEqual((3 * Math.PI) / 180 + 1e-9);
      const { dx, dy } = motionAt(DRAWING_STYLE.koch, t);
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(0.015);
    }
  });
});
