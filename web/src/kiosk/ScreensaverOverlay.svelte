<script lang="ts">
  // Everyone's here: a slow mathematical drawing over the (faintly visible)
  // sign-out list. Any mouse movement or tap fades it away to reveal the names;
  // after a while with no activity it fades back. The first tap only wakes it,
  // so nobody signs out by accident.
  import { formatElapsed, type Screensaver } from '@pass/shared';
  import Drawing from './Drawing.svelte';

  let { everyoneHereMs, pattern, hint }: { everyoneHereMs: number; pattern: Screensaver; hint: string } = $props();

  const IDLE_MS = 20_000;
  const MOVE_PX = 12; // ignore a bumped desk
  let awake = $state(false);

  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let moved = 0;
    const wake = () => {
      awake = true;
      moved = 0;
      clearTimeout(timer);
      timer = setTimeout(() => { awake = false; }, IDLE_MS);
    };
    const onMove = (e: PointerEvent) => {
      if (awake) return wake();
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (moved > MOVE_PX) wake();
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
    return () => {
      clearTimeout(timer);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', wake);
      removeEventListener('keydown', wake);
    };
  });
</script>

<div class="overlay" class:awake aria-hidden={awake}>
  <Drawing {pattern} elapsedMs={everyoneHereMs} running={!awake} />
  <p class="together">Everyone's here · {formatElapsed(everyoneHereMs)} together</p>
  <p class="hint">{hint}</p>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: color-mix(in srgb, var(--kiosk-bg) 88%, transparent);
    color: var(--kiosk-fg);
    transition: opacity 1.2s ease;
  }
  .awake { opacity: 0; pointer-events: none; }
  /* Lines may pass behind the caption; a soft halo keeps it readable. */
  p { position: absolute; left: 0; right: 0; margin: 0; text-align: center; text-shadow: 0 0 0.6em var(--kiosk-bg), 0 0 0.2em var(--kiosk-bg); }
  .together { bottom: 9vh; font-size: clamp(1.4rem, 2.6vw, 2.4rem); font-variant-numeric: tabular-nums; opacity: 0.85; }
  .hint { bottom: 4vh; font-size: clamp(1rem, 1.6vw, 1.4rem); opacity: 0.5; }
</style>
