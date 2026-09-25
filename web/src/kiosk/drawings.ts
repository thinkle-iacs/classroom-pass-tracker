// Screensaver drawings as data. Each pattern is a list of generations; each
// generation is a list of line segments: in a unit square (y down) for flat
// patterns, or around the origin (y up, radius 1) for solids. A schedule
// maps "time everyone has been here" to how much has been traced, so the
// drawing is a pure function of that time: it keeps going while hidden, and
// picks up where it was after a reload.
import type { Screensaver } from '@pass/shared';

export type Point = readonly [number, number];
export type Segment = readonly [Point, Point];
export type Generations = Segment[][];
export type Point3 = readonly [number, number, number];
export type Segment3 = readonly [Point3, Point3];

type Vec = readonly number[];
const lerp = <P extends Vec>(a: P, b: P, t: number): P => a.map((v, i) => v + (b[i]! - v) * t) as unknown as P;
const mid = <P extends Vec>(a: P, b: P): P => lerp(a, b, 0.5);
const H = Math.sqrt(3) / 2;

/** An upright equilateral triangle filling most of the square. */
function baseTriangle(size = 0.92): [Point, Point, Point] {
  const top = 0.5 - (size * H) / 2 + 0.02;
  return [[0.5, top], [0.5 + size / 2, top + size * H], [0.5 - size / 2, top + size * H]];
}
const edges = (t: readonly Point[]): Segment[] => t.map((p, i) => [p, t[(i + 1) % t.length]!] as Segment);

/** Outline, then the inverted middle triangle of every remaining triangle, level by level. */
export function sierpinskiTriangle(levels = 7): Generations {
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
 * Sierpiński tetrahedron (3D): the six edges of a regular tetrahedron, then in
 * every remaining tetrahedron the twelve edges joining its edge midpoints (the
 * octahedron that gets hollowed out), level by level.
 */
// Five levels: a sixth (3,072 edges) turns to fuzz at kiosk size.
export function sierpinskiTetrahedron(levels = 5): Segment3[][] {
  // Regular, centered on the origin, circumradius 1, one vertex straight up.
  const r = Math.sqrt(8) / 3;
  const base = [0, 1, 2].map((i) => [r * Math.cos((i * 2 * Math.PI) / 3), -1 / 3, r * Math.sin((i * 2 * Math.PI) / 3)] as Point3);
  const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] as const;
  let tetras: Point3[][] = [[[0, 1, 0], ...base]];
  const gens: Segment3[][] = [pairs.map(([i, j]) => [tetras[0]![i]!, tetras[0]![j]!] as Segment3)];
  for (let g = 1; g < levels; g++) {
    const gen: Segment3[] = [];
    const next: Point3[][] = [];
    for (const t of tetras) {
      const m = (i: number, j: number) => mid(t[i]!, t[j]!);
      // Midpoint of edge (i,j) is shared by the corners i and j; octahedron edges join
      // midpoints of edges that share exactly one vertex.
      for (const [a, b] of pairs) for (const [c, d] of pairs) {
        const shared = [a, b].filter((v) => v === c || v === d).length;
        if (shared === 1 && `${a}${b}` < `${c}${d}`) gen.push([m(a, b), m(c, d)]);
      }
      for (let k = 0; k < 4; k++) next.push([0, 1, 2, 3].map((j) => (j === k ? t[k]! : mid(t[k]!, t[j]!))));
    }
    gens.push(gen);
    tetras = next;
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

export type Flat = Exclude<Screensaver, 'sierpinski'>;
export const DRAWINGS: Record<Flat, () => Generations> = { triangle: sierpinskiTriangle, koch, stitching, tree };
export const SOLIDS: Record<Exclude<Screensaver, Flat>, () => Segment3[][]> = { sierpinski: sierpinskiTetrahedron };
export const isSolid = (p: Screensaver): p is Exclude<Screensaver, Flat> => p in SOLIDS;

/**
 * How each pattern sits and moves on screen. `aspect` stretches the unit square
 * wider (kiosk screens are wide; the triangle reads better a little broad);
 * `line` scales stroke widths. Motion turns the drawing about `pivot` (unit
 * coordinates): `spinMs` is one full turn (corners may leave the screen);
 * `rockDeg` is a gentle back-and-forth instead. Solids spin `spinMs` about their
 * vertical axis, seen from `tiltDeg` above, nodding by `wobbleDeg`.
 */
export interface DrawingStyle { aspect: number; line: number; pivot: Point; spinMs?: number; rockDeg?: number; tiltDeg?: number; wobbleDeg?: number }
export const DRAWING_STYLE: Record<Screensaver, DrawingStyle> = {
  sierpinski: { aspect: 1, line: 1.5, pivot: [0.5, 0.5], spinMs: 4 * 60_000, tiltDeg: 16, wobbleDeg: 10 },
  // Equilateral, spinning about its centroid; the tips may sweep off screen, which is fine.
  triangle: { aspect: 1, line: 1.8, pivot: [0.5, 0.653], spinMs: 7 * 60_000 },
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

const WOBBLE_MS = 150_000;
/** Camera for a solid at together-time `t`: yaw about the vertical axis, tilt toward the viewer. */
export function cameraAt(style: DrawingStyle, t: number): { yaw: number; tilt: number } {
  const deg = Math.PI / 180;
  return {
    yaw: ((2 * Math.PI * t) / (style.spinMs ?? 240_000)) % (2 * Math.PI),
    tilt: ((style.tiltDeg ?? 15) + (style.wobbleDeg ?? 0) * Math.sin((2 * Math.PI * t) / WOBBLE_MS)) * deg,
  };
}

const EYE = 5; // perspective: camera distance in circumradii
/** Rotate then project a point of a solid: screen-ish x/y (y up) and depth (near > 0). */
export function project([x, y, z]: Point3, { yaw, tilt }: { yaw: number; tilt: number }): { x: number; y: number; depth: number } {
  const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
  const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
  const k = EYE / (EYE - z2);
  return { x: x1 * k, y: y2 * k, depth: z2 };
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

const length = ([a, b]: readonly [Vec, Vec]) => Math.hypot(...a.map((v, i) => b[i]! - v));

/**
 * The segments of one generation traced up to `fraction` of its total length,
 * in order. The last one may be partial: that's the pen, still moving.
 */
export function traced<S extends readonly [Vec, Vec]>(gen: readonly S[], fraction: number): S[] {
  const total = gen.reduce((sum, s) => sum + length(s), 0);
  let budget = total * Math.min(1, Math.max(0, fraction));
  const out: S[] = [];
  for (const s of gen) {
    const l = length(s);
    if (budget >= l) { out.push(s); budget -= l; continue; }
    if (budget > 0) out.push([s[0], lerp(s[0], s[1], budget / l)] as unknown as S);
    break;
  }
  return out;
}
