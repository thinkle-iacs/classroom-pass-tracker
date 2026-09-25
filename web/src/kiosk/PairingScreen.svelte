<script lang="ts">
  // First run on a classroom computer: type the code from the teacher dashboard.
  import { Button, Container, Form, FormItem, Input, Text } from 'contain-css-svelte';
  import { PAIRING_ALPHABET } from '@pass/shared';

  let { onpair }: { onpair: (code: string, label: string) => Promise<void> } = $props();
  let code = $state('');
  let displayLabel = $state('');
  let busy = $state(false);
  let error = $state('');
  const clean = $derived(code.toUpperCase().replace(new RegExp(`[^${PAIRING_ALPHABET}]`, 'g'), ''));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (clean.length !== 6 || busy) return;
    busy = true;
    error = '';
    try { await onpair(clean, displayLabel.trim()); } catch (err) { error = err instanceof Error ? err.message : String(err); } finally { busy = false; }
  }
</script>

<Container maxWidth="36rem" marginBlock="10vh">
  <h1>Connect this display</h1>
  <p>On the teacher dashboard, choose <strong>Connect classroom display</strong> and type the code here.</p>
  <Form onsubmit={submit}>
    <FormItem layout="above" fullWidth>
      {#snippet label()}Pairing code{/snippet}
      <Input bind:value={code} maxlength={8} autocomplete="off" autocapitalize="characters" spellcheck={false}
        fontSize="2.5rem" letterSpacing="0.3em" textAlign="center" textTransform="uppercase" aria-label="Pairing code" />
    </FormItem>
    <FormItem layout="above" fullWidth>
      {#snippet label()}Name for this display (optional){/snippet}
      <Input bind:value={displayLabel} maxlength={40} placeholder="Front board" />
    </FormItem>
    <Button primary type="submit" disabled={clean.length !== 6 || busy}>{busy ? 'Connecting…' : 'Connect'}</Button>
  </Form>
  {#if error}<p role="alert"><Text danger>{error}</Text></p>{/if}
</Container>
