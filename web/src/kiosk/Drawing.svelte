<script lang="ts">
  // Traces a screensaver pattern on a canvas. What's drawn depends only on
  // `elapsedMs` (time everyone has been here), so it resumes where it was.
  // Flat patterns turn in the plane; solids spin in 3D with depth shading.
  import type { Screensaver } from '@pass/shared';
  import { cameraAt, DRAWING_STYLE, DRAWINGS, isSolid, motionAt, progressAt, project, SOLIDS, traced, type Point, type Point3 } from './drawings';

  let { pattern, elapsedMs, running, colors }: { pattern: Screensaver; elapsedMs: number; running: boolean; colors: readonly string[] } = $props();

  let canvas: HTMLCanvasElement;
  const style = $derived(DRAWING_STYLE[pattern]);
  const flat = $derived(isSolid(pattern) ? null : DRAWINGS[pattern]());
  const solid = $derived(isSolid(pattern) ? SOLIDS[pattern]() : null);
  // elapsedMs arrives a couple of times a second; animate smoothly in between.
  let base = { elapsed: 0, at: 0 };
  $effect(() => { base = { elapsed: elapsedMs, at: performance.now() }; });

  const colorOf = (g: number) => colors[g % colors.length]!;
  const DEPTH_BANDS = [0.3, 0.6, 1]; // far → near opacity for solids

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
      ctx.lineCap = 'round';
      const t = base.elapsed + (now - base.at);
      const ah = h * 0.82; // fit above the caption band; while turning it may spill anywhere
      const { dx, dy, angle } = motionAt(style, t);
      const count = (flat ?? solid)!.length;
      const { generation, fraction } = progressAt(count, t);
      const width = (g: number) => Math.max(1.2, (3.2 - g * 0.35) * style.line) * dpr;
      const pen = (x: number, y: number, g: number) => {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = colorOf(g);
        ctx.beginPath();
        ctx.arc(x, y, 4 * style.line * dpr, 0, Math.PI * 2);
        ctx.fill();
      };

      if (solid) {
        const R = Math.min(w, ah) * 0.4;
        const cx = w / 2 + dx * w, cy = ah / 2 + dy * h;
        const cam = cameraAt(style, t);
        const at = (p: Point3) => { const q = project(p, cam); return { x: cx + q.x * R, y: cy - q.y * R, depth: q.depth }; };
        for (let g = 0; g <= generation; g++) {
          const segs = g < generation ? solid[g]! : traced(solid[g]!, fraction);
          // Bucket by depth so far edges recede; one path per band keeps it fast.
          const bands = DEPTH_BANDS.map(() => new Path2D());
          for (const [a, b] of segs) {
            const p = at(a), q = at(b);
            const band = Math.min(2, Math.max(0, Math.floor(((p.depth + q.depth) / 2 + 1) * 1.5)));
            bands[band]!.moveTo(p.x, p.y);
            bands[band]!.lineTo(q.x, q.y);
          }
          ctx.lineWidth = width(g);
          ctx.strokeStyle = colorOf(g);
          bands.forEach((path, i) => { ctx.globalAlpha = DEPTH_BANDS[i]! * (g === generation ? 1 : 0.75); ctx.stroke(path); });
          const tip = g === generation && fraction < 1 ? segs[segs.length - 1]?.[1] : undefined;
          if (tip) { const p = at(tip); pen(p.x, p.y, g); }
        }
        return;
      }

      const sy = Math.min(w / style.aspect, ah) * 0.92;
      const sx = sy * style.aspect;
      const ox = (w - sx) / 2, oy = (ah - sy) / 2;
      // Slow turn about the pattern's pivot, plus a slight drift.
      const px = ox + style.pivot[0] * sx, py = oy + style.pivot[1] * sy;
      ctx.translate(px + dx * w, py + dy * h);
      ctx.rotate(angle);
      ctx.translate(-px, -py);
      const at = (p: Point) => [ox + p[0] * sx, oy + p[1] * sy] as const;
      for (let g = 0; g <= generation; g++) {
        const segs = g < generation ? flat![g]! : traced(flat![g]!, fraction);
        ctx.lineWidth = width(g);
        ctx.strokeStyle = colorOf(g);
        ctx.globalAlpha = g === generation ? 0.9 : 0.6;
        ctx.beginPath();
        for (const [a, b] of segs) { ctx.moveTo(...at(a)); ctx.lineTo(...at(b)); }
        ctx.stroke();
        const tip = g === generation && fraction < 1 ? segs[segs.length - 1]?.[1] : undefined;
        if (tip) pen(...at(tip), g);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
</style>
