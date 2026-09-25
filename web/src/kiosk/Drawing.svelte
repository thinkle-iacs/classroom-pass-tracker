<script lang="ts">
  // Traces a screensaver pattern on a canvas. What's drawn depends only on
  // `elapsedMs` (time everyone has been here), so it resumes where it was.
  import type { Screensaver } from '@pass/shared';
  import { DRAWING_STYLE, DRAWINGS, motionAt, progressAt, traced, type Segment } from './drawings';

  let { pattern, elapsedMs, running }: { pattern: Screensaver; elapsedMs: number; running: boolean } = $props();

  let canvas: HTMLCanvasElement;
  const gens = $derived(DRAWINGS[pattern]());
  const style = $derived(DRAWING_STYLE[pattern]);
  // elapsedMs arrives a couple of times a second; animate smoothly in between.
  let base = { elapsed: 0, at: 0 };
  $effect(() => { base = { elapsed: elapsedMs, at: performance.now() }; });

  const color = (g: number, alpha: number) => `hsla(${(195 + g * 28) % 360}, 60%, ${58 + g * 2}%, ${alpha})`;

  function stroke(ctx: CanvasRenderingContext2D, segs: readonly Segment[], sx: number, sy: number, ox: number, oy: number) {
    ctx.beginPath();
    for (const [a, b] of segs) {
      ctx.moveTo(ox + a[0] * sx, oy + a[1] * sy);
      ctx.lineTo(ox + b[0] * sx, oy + b[1] * sy);
    }
    ctx.stroke();
  }

  $effect(() => {
    if (!running) return;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 33) return; // ~30fps is plenty for a slow pen
      last = now;
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const sy = Math.min(w / style.aspect, h) * 0.92;
      const sx = sy * style.aspect;
      const ox = (w - sx) / 2, oy = (h - sy) / 2;
      const t = base.elapsed + (now - base.at);
      const { generation, fraction } = progressAt(gens.length, t);
      // Slow turn about the pattern's pivot, plus a slight drift.
      const { angle, dx, dy } = motionAt(style, t);
      const px = ox + style.pivot[0] * sx, py = oy + style.pivot[1] * sy;
      ctx.translate(px + dx * w, py + dy * h);
      ctx.rotate(angle);
      ctx.translate(-px, -py);
      ctx.lineCap = 'round';
      for (let g = 0; g <= generation; g++) {
        ctx.lineWidth = Math.max(1.2, (3.2 - g * 0.35) * style.line) * dpr;
        ctx.strokeStyle = color(g, g === generation ? 0.9 : 0.55);
        const segs = g < generation ? gens[g]! : traced(gens[g]!, fraction);
        stroke(ctx, segs, sx, sy, ox, oy);
        // The pen: a soft dot where the line is being drawn.
        const tip = g === generation ? segs[segs.length - 1]?.[1] : undefined;
        if (tip && fraction < 1) {
          ctx.fillStyle = color(g, 0.9);
          ctx.beginPath();
          ctx.arc(ox + tip[0] * sx, oy + tip[1] * sy, 4 * style.line * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas { position: absolute; inset: 2vh 0 16vh; width: 100%; height: calc(100% - 18vh); } /* leave room for the caption */
</style>
