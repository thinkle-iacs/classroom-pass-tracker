<script lang="ts">
  // Pair a classroom computer with a short code; list and revoke paired displays.
  import { Bar, Button, Container, Table, Text } from 'contain-css-svelte';
  import type { KioskDoc } from '@pass/shared';
  import { formatDay, formatTime, type Millis } from '../lib/records';

  let { kiosks, code, now, busy, onCreate, onRevoke }: {
    kiosks: (KioskDoc<Millis> & { id: string })[];
    code: { code: string; expiresAt: number } | null;
    now: number;
    busy: boolean;
    onCreate: () => void;
    onRevoke: (kioskId: string) => void;
  } = $props();

  const live = $derived(kiosks.filter((k) => !k.revokedAt));
  const kioskUrl = `${location.origin}/kiosk`;
  const seen = (ms: number) => (now - ms < 3 * 60_000 ? 'just now' : `${formatDay(ms)} ${formatTime(ms)}`);
</script>

<Container>
  <Bar>
    <h2>Classroom display</h2>
    <Button primary disabled={busy} onclick={onCreate}>Connect classroom display</Button>
  </Bar>
  {#if code && code.expiresAt > now}
    <p>On the classroom computer, open <strong>{kioskUrl}</strong> and enter:</p>
    <p class="code" aria-label="Pairing code">{code.code}</p>
    <p><Text muted>Works once, for the next {Math.ceil((code.expiresAt - now) / 60000)} minutes.</Text></p>
  {/if}
  {#if live.length}
    <Table>
      <thead><tr><th>Display</th><th>Paired</th><th>Last seen</th><th></th></tr></thead>
      <tbody>
        {#each live as k (k.id)}
          <tr>
            <td>{k.label}</td>
            <td>{formatDay(k.pairedAt.toMillis())}</td>
            <td>{k.lastSeenAt ? seen(k.lastSeenAt.toMillis()) : 'never'}</td>
            <td><Button danger disabled={busy} onclick={() => onRevoke(k.id)}>Disconnect</Button></td>
          </tr>
        {/each}
      </tbody>
    </Table>
  {:else}
    <p><Text muted>No display connected yet.</Text></p>
  {/if}
</Container>

<style>
  .code { font-size: 3.5rem; font-weight: 700; letter-spacing: 0.3em; font-variant-numeric: tabular-nums; margin: 0.25em 0; }
</style>
