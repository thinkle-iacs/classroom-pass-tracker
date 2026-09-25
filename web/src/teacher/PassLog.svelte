<script lang="ts">
  // Recent passes, Copy for Spreadsheet (TSV), and fixes for the wrong name tapped.
  import { Bar, Button, Container, Dialog, Inline, Option, Select, Table, Tag, Text } from 'contain-css-svelte';
  import { durationMs, passesToTsv, type Settings } from '@pass/shared';
  import { formatDay, formatTime, type PassRow } from '../lib/records';

  let { passes, students, settings, busy, onReassign, onInvalidate }: {
    passes: PassRow[];
    students: { id: string; name: string }[];
    settings: Settings;
    busy: boolean;
    onReassign: (passId: string, appStudentId: string) => void;
    onInvalidate: (passId: string) => void;
  } = $props();

  let copied = $state('');
  let fixing = $state<PassRow | null>(null);
  let fixTo = $state('');

  async function copy() {
    await navigator.clipboard.writeText(passesToTsv(passes, settings));
    copied = `Copied ${passes.length} passes. Paste into Sheets or Excel.`;
  }
  const minutes = (p: PassRow) => (p.returnedAt == null ? '' : (durationMs(p) / 60000).toFixed(1));
</script>

<Container>
  <Bar>
    <h2>Pass log</h2>
    <Inline>
      {#if copied}<Text muted>{copied}</Text>{/if}
      <Button disabled={!passes.length} onclick={copy}>Copy for Spreadsheet</Button>
    </Inline>
  </Bar>
  {#if passes.length}
    <Table sticky>
      <thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Out</th><th>Back</th><th>Minutes</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {#each passes as p (p.id)}
          <tr>
            <td>{formatDay(p.departedAt)}</td>
            <td>{p.studentName}</td>
            <td>{p.sectionTitle}</td>
            <td>{formatTime(p.departedAt)}</td>
            <td>{p.returnedAt == null ? '' : formatTime(p.returnedAt)}</td>
            <td>{minutes(p)}</td>
            <td>
              {#if p.status === 'invalidated'}<Tag>invalidated</Tag>
              {:else if p.status === 'active'}<Tag warning>{p.needsReview ? 'needs review' : 'out'}</Tag>
              {:else if p.returnedAt != null && durationMs(p) >= settings.attendanceThresholdMinutes * 60000}<Tag danger>{settings.attendanceThresholdMinutes}+ min</Tag>
              {:else}<Tag success>back</Tag>{/if}
              {#if p.corrections}<Text muted> · edited</Text>{/if}
            </td>
            <td>
              {#if p.status !== 'invalidated'}
                <Button disabled={busy} onclick={() => { fixing = p; fixTo = p.appStudentId; }}>Fix</Button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </Table>
  {:else}
    <p><Text muted>No passes yet.</Text></p>
  {/if}
</Container>

<Dialog open={!!fixing} modal dismissible onclose={() => (fixing = null)}>
  {#if fixing}
    <h2>Fix this pass</h2>
    <p>{fixing.studentName} · {formatDay(fixing.departedAt)} {formatTime(fixing.departedAt)}. The original stays in the record's history.</p>
    <Inline>
      <label for="fix-student">Student</label>
      <Select id="fix-student" bind:value={fixTo}>
        {#each students as s (s.id)}<Option value={s.id}>{s.name}</Option>{/each}
      </Select>
      <Button primary disabled={busy || fixTo === fixing.appStudentId} onclick={() => { onReassign(fixing!.id, fixTo); fixing = null; }}>Change student</Button>
    </Inline>
    <Inline marginBlock="var(--gap) 0">
      <Button danger disabled={busy} onclick={() => { onInvalidate(fixing!.id); fixing = null; }}>Invalidate pass</Button>
      <Button onclick={() => (fixing = null)}>Cancel</Button>
    </Inline>
  {/if}
</Dialog>
