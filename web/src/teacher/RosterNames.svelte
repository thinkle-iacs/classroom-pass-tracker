<script lang="ts">
  // Kiosk display names. The default is "First L."; an override always wins and survives Aspen syncs.
  import { Accordion, Button, Container, Input, Table, Text } from 'contain-css-svelte';
  import { DISPLAY_NAME_MAX, DISPLAY_NAME_WARNING, looksLikeFullName, type RosterStudentDoc, type SectionSummary } from '@pass/shared';

  let { sections, students, busy, onSave }: {
    sections: SectionSummary[]; students: (RosterStudentDoc & { id: string })[]; busy: boolean; onSave: (appStudentId: string, name: string | null) => void;
  } = $props();
  const bySection = $derived(sections.map((sec) => ({ sec, students: students.filter((s) => s.sectionKeys.includes(sec.key)) })));

  let drafts = $state<Record<string, string>>({});
  const draft = (s: RosterStudentDoc & { id: string }) => drafts[s.id] ?? s.displayNameOverride ?? '';
  const changed = (s: RosterStudentDoc & { id: string }) => draft(s).trim() !== (s.displayNameOverride ?? '');
</script>

<Container>
  <h2>Names on the display</h2>
  <p><Text warning>{DISPLAY_NAME_WARNING}</Text></p>
  <Accordion>
    {#each bySection as { sec, students } (sec.key)}
      <details>
        <summary>{sec.title} · {sec.meetings[0]?.periodId.replace('_', ' ') ?? ''} ({students.length})</summary>
        <Table>
          <thead><tr><th>Student</th><th>Shown as</th><th>Custom name</th><th></th></tr></thead>
          <tbody>
            {#each students as s (s.id)}
              <tr>
                <td>{s.givenName} {s.familyName}</td>
                <td>{s.displayNameOverride || s.defaultDisplayName}</td>
                <td>
                  <Input bind:value={() => draft(s), (v: string) => (drafts[s.id] = v)} maxlength={DISPLAY_NAME_MAX}
                    placeholder={s.defaultDisplayName} aria-label="Custom display name for {s.givenName}" />
                  {#if looksLikeFullName(draft(s), s)}<br /><Text danger>That looks like a full name. Could a shorter one work?</Text>{/if}
                </td>
                <td>
                  <Button disabled={busy || !changed(s)} onclick={() => { onSave(s.id, draft(s).trim() || null); delete drafts[s.id]; }}>Save</Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </Table>
      </details>
    {/each}
  </Accordion>
</Container>
