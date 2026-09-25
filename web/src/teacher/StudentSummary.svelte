<script lang="ts">
  // Teacher-only patterns. Never shown on the classroom display.
  import { Container, Table, Text } from 'contain-css-svelte';
  import { formatElapsed, summarizeByStudent, type Settings } from '@pass/shared';
  import type { PassRow } from '../lib/records';

  let { passes, settings }: { passes: PassRow[]; settings: Settings } = $props();
  const rows = $derived(summarizeByStudent(passes, settings));
</script>

<Container>
  <h2>Time out of class</h2>
  <p><Text muted>Completed passes in the log above. Invalidated passes don't count.</Text></p>
  {#if rows.length}
    <Table>
      <thead><tr><th>Student</th><th>Passes</th><th>Minutes out</th><th>Average</th><th>Over {settings.warningAfterMinutes} min</th><th>Over {settings.attendanceThresholdMinutes} min</th></tr></thead>
      <tbody>
        {#each rows as r (r.appStudentId)}
          <tr>
            <td>{r.studentName}</td><td>{r.passes}</td><td>{Math.round(r.totalMinutes)}</td>
            <td>{formatElapsed(r.averageMinutes * 60000)}</td><td>{r.overWarning}</td><td>{r.overThreshold}</td>
          </tr>
        {/each}
      </tbody>
    </Table>
  {:else}
    <p><Text muted>Nothing to summarize yet.</Text></p>
  {/if}
</Container>
