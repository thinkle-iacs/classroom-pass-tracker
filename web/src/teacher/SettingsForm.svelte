<script lang="ts">
  import { Button, Container, Form, FormItem, Input, Option, Select, Text } from 'contain-css-svelte';
  import DrawingPreview from './DrawingPreview.svelte';
  import { DEFAULT_SETTINGS, SCREENSAVER_CHOICES, settingsSchema, type Settings } from '@pass/shared';

  let { settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (s: Settings) => void } = $props();

  // A local copy to edit; reset whenever the saved settings change.
  let form = $state<Settings>({ ...DEFAULT_SETTINGS });
  $effect(() => { form = { ...settings }; });
  const fields: { key: Exclude<keyof Settings, 'screensaver'>; label: string }[] = [
    { key: 'warningAfterMinutes', label: 'Warning color after (minutes)' },
    { key: 'attendanceThresholdMinutes', label: 'Attendance threshold (minutes)' },
    { key: 'noPassFirstMinutes', label: 'No new passes in the first (minutes)' },
    { key: 'noPassLastMinutes', label: 'No new passes in the last (minutes)' },
  ];
  // Inputs may hand back strings; the schema wants numbers.
  const parsed = $derived(settingsSchema.safeParse({
    ...form, ...Object.fromEntries(fields.map(({ key }) => [key, Number(form[key])])),
  }));
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
    <FormItem>
      {#snippet label()}Classroom display screensaver{/snippet}
      <Select bind:value={form.screensaver}>
        {#each Object.entries(SCREENSAVER_CHOICES) as [id, name] (id)}<Option value={id}>{name}</Option>{/each}
      </Select>
    </FormItem>
    {#if form.screensaver === 'random'}
      <p><Text>The display picks a different drawing each time it loads. Choose a drawing above to preview it.</Text></p>
    {:else}
      <DrawingPreview pattern={form.screensaver} />
    {/if}
    {#if !parsed.success}<p><Text danger>{parsed.error.issues[0]?.message}</Text></p>{/if}
    <Button primary type="submit" disabled={busy || !parsed.success}>Save settings</Button>
  </Form>
</Container>
