<script lang="ts">
  // Hidden display menu (hold the title for a few seconds). For shared rooms:
  // switch this display to another teacher with their pairing code, or just
  // disconnect it. Either way the old teacher's dashboard stops listing it.
  import { Button, Dialog, Form, FormItem, Input, Text } from 'contain-css-svelte';
  import { PAIRING_ALPHABET } from '@pass/shared';

  let { open, onclose, onswitch, ondisconnect }: {
    open: boolean; onclose: () => void; onswitch: (code: string) => Promise<void>; ondisconnect: () => Promise<void>;
  } = $props();

  let code = $state('');
  let busy = $state(false);
  let error = $state('');
  const clean = $derived(code.toUpperCase().replace(new RegExp(`[^${PAIRING_ALPHABET}]`, 'g'), ''));
  $effect(() => { if (!open) { code = ''; error = ''; } });

  async function run(action: () => Promise<void>) {
    busy = true;
    error = '';
    try { await action(); onclose(); } catch (e) { error = e instanceof Error ? e.message : String(e); } finally { busy = false; }
  }
</script>

<Dialog {open} modal dismissible {onclose}>
  <h2>Classroom display</h2>
  <p>Switching classes? Get a code from <strong>Connect classroom display</strong> on the other teacher's dashboard.</p>
  <Form onsubmit={(e: SubmitEvent) => { e.preventDefault(); if (clean.length === 6) void run(() => onswitch(clean)); }}>
    <FormItem layout="above" fullWidth>
      {#snippet label()}New pairing code{/snippet}
      <Input bind:value={code} maxlength={8} autocomplete="off" spellcheck={false} textTransform="uppercase" letterSpacing="0.2em" aria-label="New pairing code" />
    </FormItem>
    <Button primary type="submit" disabled={busy || clean.length !== 6}>Switch to that class</Button>
  </Form>
  <p><Text muted>Or disconnect it and leave it on the pairing screen.</Text></p>
  <Button danger disabled={busy} onclick={() => run(ondisconnect)}>Disconnect this display</Button>
  <Button disabled={busy} onclick={onclose}>Cancel</Button>
  {#if error}<p role="alert"><Text danger>{error}</Text></p>{/if}
</Dialog>
