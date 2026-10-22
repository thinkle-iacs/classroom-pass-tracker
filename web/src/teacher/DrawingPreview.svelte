<script lang="ts">
  // Shows a screensaver drawing as the kiosk would, starting from any point in
  // its run, so a teacher can see what it looks like after five minutes
  // without waiting five minutes. It keeps playing on from there.
  import { schoolClock, type Screensaver } from '@pass/shared';
  import Drawing from '../kiosk/Drawing.svelte';
  import { paletteFor } from '../kiosk/palettes';

  let { pattern }: { pattern: Screensaver } = $props();

  const JUMPS = [0, 1, 5, 15, 30];
  let minutes = $state(5);
  const palette = paletteFor(schoolClock(Date.now()).dateKey);
</script>

<div class="preview">
  <div class="stage"><Drawing {pattern} elapsedMs={minutes * 60_000} running colors={palette.colors} /></div>
  <label>
    After {minutes} min together (today's colors: {palette.name})
    <input type="range" min="0" max="45" step="1" bind:value={minutes} />
  </label>
  <p class="jumps">
    {#each JUMPS as m (m)}<button type="button" onclick={() => { minutes = m; }}>{m === 0 ? 'Start' : `${m} min`}</button>{/each}
  </p>
</div>

<style>
  .stage { position: relative; aspect-ratio: 16 / 9; background: var(--kiosk-bg); border-radius: 0.5rem; overflow: hidden; }
  label { display: block; margin-top: 0.5rem; }
  input { display: block; width: 100%; }
  .jumps { display: flex; gap: 0.5rem; margin: 0.5rem 0 0; }
</style>
