<script lang="ts">
  // Calm ambient visual for the everyone-present state: a fractal tree that grows
  // slowly the longer the class is together and sways very gently. Resets when the
  // together timer does. Decorative only (aria-hidden).
  let { togetherMs }: { togetherMs: number } = $props();

  let canvas: HTMLCanvasElement;
  const MAX_DEPTH = 10;
  // One more branching level every ~3 minutes, eased between levels.
  const growth = $derived(Math.min(MAX_DEPTH, 1 + togetherMs / 180_000));

  $effect(() => {
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    const draw = (t: number) => {
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.clearRect(0, 0, w, h);
      const sway = Math.sin(t / 9000) * 0.05;
      const branch = (x: number, y: number, len: number, angle: number, depth: number) => {
        const amount = Math.min(1, growth - depth); // partial growth of the newest level
        if (amount <= 0) return;
        const x2 = x + Math.sin(angle) * len * amount;
        const y2 = y - Math.cos(angle) * len * amount;
        ctx.strokeStyle = `hsla(${150 + depth * 12}, 45%, ${45 + depth * 3}%, ${0.55 - depth * 0.03})`;
        ctx.lineWidth = Math.max(1, (MAX_DEPTH - depth) * 1.4);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        if (amount < 1) return;
        branch(x2, y2, len * 0.74, angle - 0.42 + sway, depth + 1);
        branch(x2, y2, len * 0.74, angle + 0.38 + sway, depth + 1);
      };
      branch(w / 2, h, h * 0.24, sway, 0);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
  canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 0; }
</style>
