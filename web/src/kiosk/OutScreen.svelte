<script lang="ts">
  // "MAYA R. IS OUT / 6:42 / I'M BACK". Elapsed time only, never a countdown.
  // Escalation colors are bespoke by design (theme.css → --kiosk-out-*).
  import { Button } from 'contain-css-svelte';
  import { formatElapsed, type Escalation } from '@pass/shared';

  let { name, elapsedMs, level, thresholdMinutes, busy, notice, onreturn }: {
    name: string; elapsedMs: number; level: Escalation; thresholdMinutes: number; busy: boolean; notice: string; onreturn: () => void;
  } = $props();
</script>

<section class={level} aria-live="polite">
  <h1>{name} is out</h1>
  <p class="timer" role="timer">{formatElapsed(elapsedMs)}</p>
  {#if level === 'critical'}<p class="note">{thresholdMinutes}-minute attendance threshold reached</p>{/if}
  <Button disabled={busy} onclick={onreturn}>I'm back</Button>
  {#if notice}<p class="note" role="status">{notice}</p>{/if}
</section>

<style>
  section {
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2vh;
    padding: 4vh 4vw;
    text-align: center;
    background: var(--kiosk-out-normal-bg);
    color: var(--kiosk-out-fg);
    transition: background 1.5s ease;
    --heading-fg: var(--kiosk-out-fg);
    --button-bg: var(--kiosk-back-bg);
    --button-fg: var(--kiosk-back-fg);
    --button-padding: 1.5rem 4rem;
    --button-font-size: clamp(1.8rem, 4vw, 3.5rem);
    --button-font-weight: 700;
  }
  .warning { background: var(--kiosk-out-warning-bg); }
  .critical { background: var(--kiosk-out-critical-bg); box-shadow: inset 0 0 0 1.5vw var(--kiosk-out-warning-bg); }
  h1 { margin: 0; font-size: clamp(2.5rem, 7vw, 7rem); text-transform: uppercase; line-height: 1.1; }
  .timer { margin: 0; font-size: clamp(6rem, 22vw, 20rem); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
  .note { margin: 0; font-size: clamp(1.4rem, 3vw, 2.6rem); font-weight: 600; }
</style>
