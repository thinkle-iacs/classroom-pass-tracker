<script lang="ts">
  // Today's classes as timelines: together time, interrupted by students out.
  // Each row spans the class's first-to-last pass activity (plus a margin),
  // because passes don't store block times. Teacher-only.
  import { Container, Text } from 'contain-css-svelte';
  import { classRhythm, schoolClock } from '@pass/shared';
  import { formatTime, type PassRow } from '../lib/records';

  let { passes, now }: { passes: PassRow[]; now: number } = $props();
  const MARGIN = 10 * 60_000;

  const rows = $derived.by(() => {
    const today = schoolClock(now).dateKey;
    const bySection = new Map<string, PassRow[]>();
    for (const p of passes) {
      if (p.status === 'invalidated' || schoolClock(p.departedAt).dateKey !== today) continue;
      bySection.set(p.sectionKey, [...(bySection.get(p.sectionKey) ?? []), p]);
    }
    return [...bySection.values()].map((list) => {
      const start = Math.min(...list.map((p) => p.departedAt)) - MARGIN;
      const end = Math.min(now, Math.max(...list.map((p) => p.returnedAt ?? now)) + MARGIN);
      return { title: list[0]!.sectionTitle, rhythm: classRhythm(list, start, end, now) };
    }).sort((a, b) => a.rhythm.start - b.rhythm.start);
  });
  const pct = (ms: number, span: number) => `${(100 * ms) / span}%`;
</script>

<Container>
  <h2>Today's rhythm</h2>
  {#each rows as { title, rhythm } (title + rhythm.start)}
    {@const span = rhythm.end - rhythm.start}
    <p><strong>{title}</strong> · {formatTime(rhythm.start)}–{formatTime(rhythm.end)} ·
      <Text muted>{Math.round(rhythm.togetherMs / 60000)} min together, {Math.round(rhythm.outMs / 60000)} min with someone out</Text></p>
    <div class="track" role="img" aria-label="{title}: {Math.round(rhythm.outMs / 60000)} minutes with someone out">
      {#each rhythm.segments as s (s.start)}
        <span class={s.kind} style:width={pct(s.end - s.start, span)} title={s.studentName ? `${s.studentName}: ${formatTime(s.start)}–${formatTime(s.end)}` : undefined}></span>
      {/each}
    </div>
  {:else}
    <p><Text muted>No passes today yet.</Text></p>
  {/each}
</Container>

<style>
  .track { display: flex; height: 1.5rem; border-radius: 0.4rem; overflow: hidden; margin-bottom: var(--gap); }
  .together { background: var(--success-bg); opacity: 0.35; }
  .out { background: var(--danger-bg); }
</style>
