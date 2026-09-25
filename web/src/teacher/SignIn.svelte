<script lang="ts">
  import { Button, Container, Form, FormItem, Input, Text } from 'contain-css-svelte';

  let { onGoogle, onDev, error }: { onGoogle: () => void; onDev: ((email: string) => void) | null; error: string } = $props();
  let email = $state('teacher@innovationcharter.org');
</script>

<Container maxWidth="32rem" marginBlock="10vh">
  <h1>Pass Tracker</h1>
  <p>Sign in with your school Google account to see your classes and connect the classroom display.</p>
  <Button primary onclick={onGoogle}>Sign in with Google</Button>
  {#if onDev}
    <h2>Emulator sign-in</h2>
    <Form onsubmit={(e: SubmitEvent) => { e.preventDefault(); onDev(email); }}>
      <FormItem layout="above" fullWidth>
        {#snippet label()}Any @innovationcharter.org email{/snippet}
        <Input type="email" bind:value={email} />
      </FormItem>
      <Button type="submit">Dev sign-in</Button>
    </Form>
  {/if}
  {#if error}<p role="alert"><Text danger>{error}</Text></p>{/if}
</Container>
