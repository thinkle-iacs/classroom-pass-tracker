<script lang="ts">
  // Everyone-present state: class header, availability banner, the roster.
  import { formatElapsed, UNAVAILABLE_MESSAGE, type Availability } from '@pass/shared';
  import Ambient from './Ambient.svelte';
  import RosterGrid from './RosterGrid.svelte';
  import type { KioskDisplay } from './state';

  let { display, available, togetherMs, notice, disabled, onpick }: {
    display: KioskDisplay; available: Availability; togetherMs: number | null; notice: string; disabled: boolean; onpick: (k: string) => void;
  } = $props();
</script>

<section>
  {#if togetherMs != null}<Ambient {togetherMs} />{/if}
  <header>
    <h1>{display.sectionTitle ?? 'No class right now'}</h1>
    {#if display.blockLabel}<p>{display.blockLabel}</p>{/if}
    {#if togetherMs != null}<p class="together">Everyone's here · {formatElapsed(togetherMs)} together</p>{/if}
  </header>
  {#if notice}
    <p class="banner" role="status">{notice}</p>
  {:else if !available.allowed && display.sectionTitle}
    <p class="banner" role="status">{UNAVAILABLE_MESSAGE[available.reason!]}</p>
  {/if}
  {#if display.roster.length}
    <RosterGrid roster={display.roster} disabled={disabled || !available.allowed} {onpick} />
  {/if}
</section>

<style>
  section {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 3vh 3vw;
    background: var(--kiosk-bg);
    color: var(--kiosk-fg);
    --heading-fg: var(--kiosk-fg);
  }
  section > :global(:not(canvas)) { position: relative; z-index: 1; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 2rem; margin-bottom: 2vh; }
  h1 { margin: 0; font-size: clamp(2rem, 4vw, 3.5rem); }
  header p { margin: 0; font-size: clamp(1.2rem, 2vw, 1.8rem); opacity: 0.8; }
  .together { font-variant-numeric: tabular-nums; }
  .banner { font-size: clamp(1.4rem, 2.6vw, 2.2rem); font-weight: 600; margin: 0 0 2vh; }
</style>
