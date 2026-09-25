<script lang="ts">
  // Big, touch-friendly name buttons. Tap your name, leave.
  import { Button } from 'contain-css-svelte';

  let { roster, disabled, onpick }: { roster: { k: string; name: string }[]; disabled: boolean; onpick: (k: string) => void } = $props();
</script>

<ul aria-label="Tap your name before you leave">
  {#each roster as student (student.k)}
    <li><Button {disabled} onclick={() => onpick(student.k)}>{student.name}</Button></li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
    gap: 0.75rem;
    --button-bg: var(--kiosk-name-bg);
    --button-fg: var(--kiosk-name-fg);
    --button-width: 100%;
    --button-padding: 1.1rem 0.75rem;
    --button-font-size: clamp(1.4rem, 2.4vw, 2.2rem);
    --button-font-weight: 600;
  }
</style>
