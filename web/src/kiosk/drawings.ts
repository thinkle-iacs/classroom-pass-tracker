// Screensaver drawings as data. Each pattern is a list of generations; each
// generation is a list of line segments in a unit square (y down). A schedule
// maps "time everyone has been here" to how much has been traced, so the
// drawing is a pure function of that time: it keeps going while hidden, and
// picks up where it was after a reload.
import type { Screensaver } from '@pass/shared';

export type Point = readonly [number, number];
export type Segment = readonly [Point, Point];
export type Generations = Segment[][];

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const H = Math.sqrt(3) / 2;

/** An upright equilateral triangle filling most of the square. */
function baseTriangle(size = 0.92): [Point, Point, Point] {
  const top = 0.5 - (size * H) / 2 + 0.02;
  return [[0.5, top], [0.5 + size / 2, top + size * H], [0.5 - size / 2, top + size * H]];
}
const edges = (t: readonly Point[]): Segment[] => t.map((p, i) => [p, t[(i + 1) % t.length]!] as Segment);

/** Outline, then the inverted middle triangle of every remaining triangle, level by level. */
export function sierpinski(levels = 7): Generations {
  let triangles = [baseTriangle()];
  const gens: Generations = [edges(triangles[0]!)];
  for (let g = 1; g < levels; g++) {
    const next: [Point, Point, Point][] = [];
    const gen: Segment[] = [];
    for (const [a, b, c] of triangles) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      gen.push(...edges([ab, bc, ca]));
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c]);
    }
    gens.push(gen);
    triangles = next;
  }
  return gens;
}

/**
 * Koch snowflake, drawn additively: the triangle, then on every edge a new
 * outward equilateral bump (its two outer sides), again and again. The middle
 * thirds stay visible underneath, like construction lines.
 */
export function koch(levels = 6): Generations {
  // Centered on the triangle's centroid: the finished snowflake reaches the circumradius R all round.
  const R = 0.43;
  const corners = [0, 1, 2].map((i) => [0.5 + R * Math.sin((i * 2 * Math.PI) / 3), 0.5 - R * Math.cos((i * 2 * Math.PI) / 3)] as Point);
  let outline: Segment[] = edges(corners);
  const gens: Generations = [outline];
  for (let g = 1; g < levels; g++) {
    const next: Segment[] = [];
    const gen: Segment[] = [];
    for (const [p, q] of outline) {
      const s = lerp(p, q, 1 / 3), e = lerp(p, q, 2 / 3);
      // Rotate (e - s) by -60° about s for the outward apex (outline runs clockwise on screen).
      const dx = e[0] - s[0], dy = e[1] - s[1];
      const apex: Point = [s[0] + dx / 2 + dy * H, s[1] + dy / 2 - dx * H];
      gen.push([s, apex], [apex, e]);
      next.push([p, s], [s, apex], [apex, e], [e, q]);
    }
    gens.push(gen);
    outline = next;
  }
  return gens;
}

/**
 * Curve stitching: straight lines from one axis to the other whose envelope is
 * a curve. The axes, then each quadrant in turn, then finer passes between.
 */
export function stitching(): Generations {
  const c: Point = [0.5, 0.5];
  const r = 0.46;
  const axes: Segment[] = [[[c[0], c[1] - r], [c[0], c[1] + r]], [[c[0] - r, c[1]], [c[0] + r, c[1]]]];
  const quadrants: [number, number][] = [[1, -1], [-1, -1], [-1, 1], [1, 1]];
  // (0, n-i) to (i, 0): the classic parabola-in-a-corner, in each quadrant's direction.
  const quadrant = ([sx, sy]: [number, number], n: number, offset: number): Segment[] =>
    Array.from({ length: n }, (_, i) => {
      const t = (i + offset) / n;
      return [[c[0], c[1] + sy * r * (1 - t)], [c[0] + sx * r * t, c[1]]] as Segment;
    });
  return [
    axes,
    ...quadrants.map((q) => quadrant(q, 12, 0.5)),
    ...quadrants.map((q) => quadrant(q, 24, 0.25)),
    ...quadrants.map((q) => quadrant(q, 48, 0.125)),
  ];
}

/** A binary tree, one depth per generation. */
export function tree(levels = 10): Generations {
  const gens: Generations = [];
  let tips: { p: Point; angle: number; len: number }[] = [{ p: [0.5, 0.98], angle: 0, len: 0.24 }];
  for (let g = 0; g < levels; g++) {
    const gen: Segment[] = [];
    const next: typeof tips = [];
    for (const { p, angle, len } of tips) {
      const q: Point = [p[0] + Math.sin(angle) * len, p[1] - Math.cos(angle) * len];
      gen.push([p, q]);
      next.push({ p: q, angle: angle - 0.42, len: len * 0.74 }, { p: q, angle: angle + 0.38, len: len * 0.74 });
    }
    gens.push(gen);
    tips = next;
  }
  return gens;
}

export const DRAWINGS: Record<Screensaver, () => Generations> = { sierpinski, koch, stitching, tree };

/**
 * How each pattern sits and moves on screen. `aspect` stretches the unit square
 * wider (kiosk screens are wide; the triangle reads better a little broad);
 * `line` scales stroke widths. Motion turns the drawing about `pivot` (unit
 * coordinates): `spinMs` is one full turn, for shapes round enough to turn
 * without clipping or shrinking; `rockDeg` is a gentle back-and-forth instead.
 */
export interface DrawingStyle { aspect: number; line: number; pivot: Point; spinMs?: number; rockDeg?: number }
export const DRAWING_STYLE: Record<Screensaver, DrawingStyle> = {
  sierpinski: { aspect: 1.3, line: 1.8, pivot: [0.5, 0.653], rockDeg: 6 }, // pivot = centroid
  koch: { aspect: 1, line: 1, pivot: [0.5, 0.5], spinMs: 6 * 60_000 },
  stitching: { aspect: 1, line: 1, pivot: [0.5, 0.5], spinMs: 5 * 60_000 },
  tree: { aspect: 1, line: 1, pivot: [0.5, 0.98], rockDeg: 3 }, // sways from the base
};

const ROCK_MS = 90_000;
/** Screen-space motion at together-time `t`: an angle (radians) and a small drift (fractions of the canvas). */
export function motionAt(style: DrawingStyle, t: number): { angle: number; dx: number; dy: number } {
  const wave = (period: number) => Math.sin((2 * Math.PI * t) / period);
  const angle = style.spinMs ? (2 * Math.PI * t) / style.spinMs : ((style.rockDeg ?? 0) * Math.PI / 180) * wave(ROCK_MS);
  // Two slow, unrelated periods, so the drift never visibly repeats.
  return { angle: angle % (2 * Math.PI), dx: 0.015 * wave(97_000), dy: 0.012 * wave(131_000) };
}

// ------------------------------------------------------------------ schedule

/** How long the full elaboration takes. A block is ~80 minutes; this is most of one. */
export const FULL_DRAWING_MS = 45 * 60_000;
/** Each generation gets this much more time than the last: later ones hold more detail. */
const GROWTH = 1.35;

export interface Progress { generation: number; fraction: number; done: boolean }

/** Which generation is being traced at `elapsedMs`, and how far through it. */
export function progressAt(generationCount: number, elapsedMs: number, totalMs = FULL_DRAWING_MS): Progress {
  const weights = Array.from({ length: generationCount }, (_, g) => GROWTH ** g);
  const unit = totalMs / weights.reduce((a, b) => a + b, 0);
  let t = Math.max(0, elapsedMs);
  for (let g = 0; g < generationCount; g++) {
    const span = weights[g]! * unit;
    if (t < span) return { generation: g, fraction: t / span, done: false };
    t -= span;
  }
  return { generation: generationCount - 1, fraction: 1, done: true };
}

const length = ([a, b]: Segment) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * The segments of one generation traced up to `fraction` of its total length,
 * in order. The last one may be partial: that's the pen, still moving.
 */
export function traced(gen: readonly Segment[], fraction: number): Segment[] {
  const total = gen.reduce((sum, s) => sum + length(s), 0);
  let budget = total * Math.min(1, Math.max(0, fraction));
  const out: Segment[] = [];
  for (const s of gen) {
    const l = length(s);
    if (budget >= l) { out.push(s); budget -= l; continue; }
    if (budget > 0) out.push([s[0], lerp(s[0], s[1], budget / l)]);
    break;
  }
  return out;
}
