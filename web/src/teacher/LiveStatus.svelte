<script lang="ts">
  // What the classroom display shows right now, plus the live controls.
  import { Bar, Button, Container, Inline, Option, Select, Tag } from 'contain-css-svelte';
  import { escalation, formatElapsed, type SectionSummary, type Settings } from '@pass/shared';
  import { formatTime, type PassRow } from '../lib/records';

  let { sections, current, manualKey, paused, active, settings, now, busy, onOverride, onPause, onEnd, onInvalidate }: {
    sections: SectionSummary[];
    current: { title: string | null; label: string | null; manual: boolean };
    manualKey: string | null;
    paused: boolean;
    active: PassRow | null;
    settings: Settings;
    now: number;
    busy: boolean;
    onOverride: (key: string | null) => void;
    onPause: (paused: boolean) => void;
    onEnd: (passId: string) => void;
    onInvalidate: (passId: string) => void;
  } = $props();

  const level = $derived(active ? escalation(now - active.departedAt, settings) : 'normal');
</script>

<Container>
  <Bar>
    <h2>Now</h2>
    <Inline>
      {#if paused}<Tag warning>Passes paused</Tag>{:else}<Tag success>Passes allowed</Tag>{/if}
      <Button disabled={busy} onclick={() => onPause(!paused)}>{paused ? 'Allow passes' : 'Pause passes'}</Button>
    </Inline>
  </Bar>
  <p>
    <strong>{current.title ?? 'No class right now'}</strong>
    {#if current.label} · {current.label}{/if}
    {#if current.manual} · picked by hand for today{/if}
  </p>
  <Inline>
    <label for="section-override">Class on the display</label>
    <Select id="section-override" bind:value={() => manualKey ?? '', (v: string) => onOverride(v || null)} disabled={busy}>
      <Option value="">Automatic (bell schedule)</Option>
      {#each sections as s (s.key)}<Option value={s.key}>{s.title} · {s.meetings.length ? s.meetings[0]!.periodId.replace('_', ' ') : 'no meetings'}</Option>{/each}
    </Select>
  </Inline>
  {#if active}
    <Bar marginBlock="var(--gap) 0">
      <p>
        <strong>{active.studentName}</strong> has been out since {formatTime(active.departedAt)}
        {#if level === 'critical'}<Tag danger>{formatElapsed(now - active.departedAt)}</Tag>
        {:else if level === 'warning'}<Tag warning>{formatElapsed(now - active.departedAt)}</Tag>
        {:else}<Tag>{formatElapsed(now - active.departedAt)}</Tag>{/if}
      </p>
      <Inline>
        <Button primary disabled={busy} onclick={() => onEnd(active.id)}>End pass</Button>
        <Button danger disabled={busy} onclick={() => onInvalidate(active.id)}>Invalidate</Button>
      </Inline>
    </Bar>
  {:else}
    <p>Everyone's here.</p>
  {/if}
</Container>
