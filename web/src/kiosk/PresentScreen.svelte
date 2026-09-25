<script lang="ts">
  // Everyone-present state: the sign-out list, under a screensaver while nobody is using it.
  import { Bar, Container } from 'contain-css-svelte';
  import { UNAVAILABLE_MESSAGE, type Availability } from '@pass/shared';
  import RosterGrid from './RosterGrid.svelte';
  import ScreensaverOverlay from './ScreensaverOverlay.svelte';
  import type { KioskDisplay } from './state';

  let { display, available, togetherMs, notice, disabled, onpick }: {
    display: KioskDisplay; available: Availability; togetherMs: number | null; notice: string; disabled: boolean; onpick: (k: string) => void;
  } = $props();

  const unavailable = $derived(!available.allowed && display.sectionTitle ? UNAVAILABLE_MESSAGE[available.reason!] : '');
</script>

<div class="kiosk">
  <Bar primary marginBlock="0">
    <h1>Class Signout</h1>
    <p class="class">{display.sectionTitle ?? 'No class right now'}{display.blockLabel ? ` · ${display.blockLabel}` : ''}</p>
  </Bar>
  <div class="stage">
    <Container maxWidth="100%" marginBlock="0">
      {#if notice || unavailable}<p class="banner" role="status">{notice || unavailable}</p>{/if}
      {#if display.roster.length}
        <RosterGrid roster={display.roster} disabled={disabled || !available.allowed} {onpick} />
      {/if}
    </Container>
    {#if togetherMs != null && !notice}
      <ScreensaverOverlay everyoneHereMs={togetherMs} pattern={display.settings.screensaver ?? 'sierpinski'}
        hint={unavailable || 'Move the mouse or tap the screen to sign out'} />
    {/if}
  </div>
</div>

<style>
  .kiosk {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--kiosk-bg);
    --container-bg: var(--kiosk-bg);
    --container-fg: var(--kiosk-fg);
    --container-padding: 3vh 3vw;
    --line-width: 100%; /* the roster is a <ul>; don't cap it at a reading measure */
    --bar-padding: 1.5vh 3vw;
  }
  h1 { margin: 0; color: inherit; font-size: clamp(1.8rem, 3.4vw, 3rem); }
  .class { margin: 0; font-size: clamp(1.2rem, 2vw, 1.8rem); }
  .stage { position: relative; flex: 1; display: flex; flex-direction: column; }
  .stage > :global(*:first-child) { flex: 1; }
  .banner { font-size: clamp(1.4rem, 2.6vw, 2.2rem); font-weight: 600; margin: 0 0 2vh; }
</style>
