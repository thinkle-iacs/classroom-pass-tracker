import { describe, expect, it } from 'vitest';
import { BOUNCE_ASPECT, DRAWING_STYLE, randomScreensaver, resolveScreensaver, bouncingTriangle, DRAWINGS, FULL_DRAWING_MS, koch, progressAt, project, sierpinskiTetrahedron, sierpinskiTriangle, stitching, steadyProgressAt, traced, type Segment } from './drawings';
import { PALETTES, paletteFor } from './palettes';

const inside = (segs: Segment[]) => segs.flat().every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1);

describe('screensaver drawings', () => {
  it('Sierpinski triangle adds 3^(g-1) inverted triangles per level, and is equilateral', () => {
    const gens = sierpinskiTriangle(5);
    expect(gens.map((g) => g.length)).toEqual([3, 3, 9, 27, 81]);
    const sides = gens[0]!.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
    for (const s of sides) expect(s).toBeCloseTo(sides[0]!, 9);
  });
  it('Sierpinski tetrahedron: 6 edges, then 12 octahedron edges per remaining tetrahedron', () => {
    const gens = sierpinskiTetrahedron(4);
    expect(gens.map((g) => g.length)).toEqual([6, 12, 48, 192]);
    const len = ([a, b]: (typeof gens)[0][0]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    // Regular: all six outer edges equal, and each level's edges are half the last.
    for (const e of gens[0]!) expect(len(e)).toBeCloseTo(len(gens[0]![0]!), 9);
    for (let g = 1; g < 4; g++) for (const e of gens[g]!) expect(len(e)).toBeCloseTo(len(gens[0]![0]!) / 2 ** g, 9);
    // Everything stays within the unit circumsphere.
    for (const [a, b] of gens.flat()) for (const p of [a, b]) expect(Math.hypot(...p)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('projects with perspective: nearer points look bigger', () => {
    const cam = { yaw: 0, tilt: 0 };
    expect(project([0, 0, 0], cam)).toEqual({ x: 0, y: 0, depth: 0 });
    expect(project([1, 0, 0.5], cam).x).toBeGreaterThan(project([1, 0, -0.5], cam).x);
    expect(project([1, 0, 0], { yaw: Math.PI / 2, tilt: 0 }).depth).toBeCloseTo(-1);
  });
  it('picks one palette per day, and varies across days', () => {
    expect(paletteFor('2026-09-28')).toBe(paletteFor('2026-09-28'));
    const week = new Set(Array.from({ length: 30 }, (_, d) => paletteFor(`2026-10-${String(d + 1).padStart(2, '0')}`).name));
    expect(week.size).toBeGreaterThan(3);
    for (const p of PALETTES) for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
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

describe('bouncing triangle', () => {
  const legs = bouncingTriangle(60);
  it('is a connected path that reflects off the edges at equal angles', () => {
    expect(legs).toHaveLength(60);
    const dir = (i: number) => { const [a, b] = legs[i]![0]!; const dx = (b[0] - a[0]) * BOUNCE_ASPECT, dy = b[1] - a[1]; return [dx, dy, Math.hypot(dx, dy)] as const; };
    for (let i = 1; i < legs.length; i++) {
      expect(legs[i]![0]![0][0]).toBeCloseTo(legs[i - 1]![0]![1][0], 9);
      expect(legs[i]![0]![0][1]).toBeCloseTo(legs[i - 1]![0]![1][1], 9);
      // Speed along each axis is unchanged by a reflection; only signs flip.
      const [ax, ay, al] = dir(i - 1), [bx, by, bl] = dir(i);
      expect(Math.abs(bx / bl)).toBeCloseTo(Math.abs(ax / al), 9);
      expect(Math.abs(by / bl)).toBeCloseTo(Math.abs(ay / al), 9);
    }
  });
  it('stays in the box, is the same every time, and moves at a constant speed', () => {
    expect(inside(legs.flat())).toBe(true);
    expect(bouncingTriangle(60)).toEqual(legs);
    const at = (ms: number) => steadyProgressAt(legs, 0.1, ms);
    expect(at(0)).toMatchObject({ generation: 0, fraction: 0 });
    expect(at(1e9)).toMatchObject({ done: true });
    // Ten seconds at 0.1 screen heights per second is one screen height of travel, wherever it falls.
    const len = ([[a, b]]: [Segment]) => Math.hypot((b[0] - a[0]) * BOUNCE_ASPECT, b[1] - a[1]);
    let travelled = 0;
    const p = at(10_000);
    for (let g = 0; g < p.generation; g++) travelled += len([legs[g]![0]!]);
    travelled += len([legs[p.generation]![0]!]) * p.fraction;
    expect(travelled).toBeCloseTo(1, 6);
  });
});

describe('random screensaver', () => {
  it('resolves random once through the picker, and leaves a chosen drawing alone', () => {
    expect(resolveScreensaver('random', () => 'koch')).toBe('koch');
    expect(resolveScreensaver('tree', () => 'koch')).toBe('tree');
  });
  it('can reach every drawing, and only drawings', () => {
    const all = Object.keys(DRAWING_STYLE);
    const seen = new Set(all.map((_, i) => randomScreensaver(() => (i + 0.5) / all.length)));
    expect([...seen].sort()).toEqual([...all].sort());
    expect(randomScreensaver(() => 0.999999)).toBeDefined();
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
