<script lang="ts">
  import { Button, Container, Form, FormItem, Input, Text } from 'contain-css-svelte';
  import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@pass/shared';

  let { settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (s: Settings) => void } = $props();

  // A local copy to edit; reset whenever the saved settings change.
  let form = $state<Settings>({ ...DEFAULT_SETTINGS });
  $effect(() => { form = { ...settings }; });
  // Inputs may hand back strings; the schema wants numbers.
  const parsed = $derived(settingsSchema.safeParse(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v)]))));
  const fields: { key: keyof Settings; label: string }[] = [
    { key: 'warningAfterMinutes', label: 'Warning color after (minutes)' },
    { key: 'attendanceThresholdMinutes', label: 'Attendance threshold (minutes)' },
    { key: 'noPassFirstMinutes', label: 'No new passes in the first (minutes)' },
    { key: 'noPassLastMinutes', label: 'No new passes in the last (minutes)' },
  ];
</script>

<Container>
  <h2>Settings</h2>
  <Form onsubmit={(e: SubmitEvent) => { e.preventDefault(); if (parsed.success) onSave(parsed.data); }}>
    {#each fields as f (f.key)}
      <FormItem>
        {#snippet label()}{f.label}{/snippet}
        <Input type="number" min="0" max="120" bind:value={form[f.key]} />
      </FormItem>
    {/each}
    {#if !parsed.success}<p><Text danger>{parsed.error.issues[0]?.message}</Text></p>{/if}
    <Button primary type="submit" disabled={busy || !parsed.success}>Save settings</Button>
  </Form>
</Container>
