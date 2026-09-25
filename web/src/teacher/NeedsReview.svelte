<script lang="ts">
  // Passes left open past their class (flagged stale by the server). The teacher
  // enters when the student actually came back, or invalidates the pass.
  import { Button, Container, Input, Table, Text } from 'contain-css-svelte';
  import { schoolClock } from '@pass/shared';
  import { formatDay, formatTime, type PassRow } from '../lib/records';

  let { passes, busy, onEnd, onInvalidate }: {
    passes: PassRow[]; busy: boolean; onEnd: (passId: string, returnedAt: number) => void; onInvalidate: (passId: string) => void;
  } = $props();

  let times = $state<Record<string, string>>({});
  /** "10:42" on the day the student left, in school time. */
  function returnedAt(p: PassRow): number | null {
    const [h, m] = (times[p.id] ?? '').split(':').map(Number);
    if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return null;
    const at = p.departedAt + (h * 60 + m - schoolClock(p.departedAt).minutes) * 60000;
    return at > p.departedAt && at <= Date.now() ? at : null;
  }
</script>

{#if passes.length}
  <Container>
    <h2>Needs review</h2>
    <p><Text muted>These passes were never closed. Enter when the student came back, or invalidate the pass.</Text></p>
    <Table>
      <thead><tr><th>Student</th><th>Left</th><th>Came back at</th><th></th></tr></thead>
      <tbody>
        {#each passes as p (p.id)}
          <tr>
            <td>{p.studentName}<br /><Text muted>{p.sectionTitle}</Text></td>
            <td>{formatDay(p.departedAt)} {formatTime(p.departedAt)}</td>
            <td><Input type="time" bind:value={times[p.id]} aria-label="Return time for {p.studentName}" /></td>
            <td>
              <Button primary disabled={busy || returnedAt(p) == null} onclick={() => onEnd(p.id, returnedAt(p)!)}>Save</Button>
              <Button danger disabled={busy} onclick={() => onInvalidate(p.id)}>Invalidate</Button>
            </td>
          </tr>
        {/each}
      </tbody>
    </Table>
  </Container>
{/if}
