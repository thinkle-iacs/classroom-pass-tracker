<script lang="ts">
  // Classroom display controller: pairing → live display → pass taps.
  // The kiosk is an untrusted public client. It holds a custom-token session
  // scoped to one room and reads exactly one document, displays/{roomId}.
  import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
  import { doc, type FirestoreError } from 'firebase/firestore';
  import { connect, errorCode, errorMessage } from '../lib/firebase';
  import { liveDoc, online, ticker } from '../lib/live.svelte';
  import { wakeLock } from '../lib/wakeLock.svelte';
  import OutScreen from './OutScreen.svelte';
  import PairingScreen from './PairingScreen.svelte';
  import PresentScreen from './PresentScreen.svelte';
  import { kioskAvailability, outState, togetherSince, type KioskDisplay } from './state';

  const HEARTBEAT_MS = 60_000;
  const { auth, db, call } = connect('kiosk');

  let user = $state<User | null | undefined>(undefined);
  let roomId = $state<string | null>(null);
  let serverOffset = $state(0);
  let busy = $state(false);
  let notice = $state('');

  $effect(() => onAuthStateChanged(auth, async (u) => {
    const claims = u ? (await u.getIdTokenResult()).claims : null;
    roomId = claims?.kiosk === true && typeof claims.roomId === 'string' ? claims.roomId : null;
    user = roomId ? u : null;
  }));

  /** Revoked, or the room is gone: back to the pairing screen. */
  async function unpair() {
    roomId = null;
    await signOut(auth);
  }
  const deniedMeansUnpaired = (e: FirestoreError) => { if (e.code === 'permission-denied') void unpair(); };

  const display = liveDoc<KioskDisplay>(() => (roomId ? doc(db, 'displays', roomId) : null), deniedMeansUnpaired);
  const clock = ticker(500);
  const isOnline = online();
  const wake = wakeLock(() => !!roomId);

  const serverNow = $derived(clock.now + serverOffset);
  const offline = $derived(!isOnline.value || (display.value != null && display.fromCache));
  const out = $derived(display.value ? outState(display.value, serverNow) : null);
  const available = $derived(display.value ? kioskAvailability(display.value, serverNow) : null);
  const since = $derived(display.value ? togetherSince(display.value) : null);

  async function heartbeat() {
    if (!roomId || !navigator.onLine) return;
    const sent = Date.now();
    try {
      const { serverNow: s } = await call('kioskHeartbeat', {});
      serverOffset = s - (sent + Date.now()) / 2;
    } catch (e) {
      if (['permission-denied', 'unauthenticated', 'not-found'].includes(errorCode(e))) await unpair();
    }
  }
  $effect(() => {
    if (!roomId) return;
    void heartbeat();
    const id = setInterval(heartbeat, HEARTBEAT_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void heartbeat(); };
    document.addEventListener('visibilitychange', onVisible);
    addEventListener('online', heartbeat);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); removeEventListener('online', heartbeat); };
  });

  async function pair(code: string, label: string) {
    const res = await call('pairKiosk', label ? { code, label } : { code }).catch((e) => { throw new Error(errorMessage(e)); });
    await signInWithCustomToken(auth, res.token);
  }

  function flash(message: string) {
    notice = message;
    setTimeout(() => { if (notice === message) notice = ''; }, 4000);
  }

  /** One requestId per tap, so a retried or doubled call can't make two passes. */
  async function act(name: 'kioskStartPass' | 'kioskReturn', k: string) {
    if (busy || offline) return;
    busy = true;
    try {
      await call(name, { k, requestId: crypto.randomUUID() });
    } catch (e) {
      const code = errorCode(e);
      if (code === 'permission-denied' || code === 'unauthenticated') await unpair();
      else flash(code === 'not-found' ? 'The roster just changed. Try again.' : errorMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

{#if user === undefined}
  <p>Loading…</p>
{:else if !roomId}
  <PairingScreen onpair={pair} />
{:else if !display.value}
  <p>Connecting…</p>
{:else if out && display.value.active}
  <OutScreen name={out.name} elapsedMs={out.elapsedMs} level={out.level} thresholdMinutes={display.value.settings.attendanceThresholdMinutes}
    busy={busy || offline} notice={offline ? 'Offline: reconnecting…' : notice} onreturn={() => act('kioskReturn', display.value!.active!.k)} />
{:else}
  <PresentScreen display={display.value} available={available!} togetherMs={since == null ? null : serverNow - since}
    notice={offline ? 'Offline: reconnecting…' : notice} disabled={busy || offline} onpick={(k) => act('kioskStartPass', k)} />
{/if}
{#if roomId && (wake.state === 'unsupported' || wake.state === 'denied')}
  <p class="sleep-note">This screen may go to sleep on its own.</p>
{/if}

<style>
  .sleep-note { position: fixed; bottom: 0.5rem; right: 1rem; margin: 0; font-size: 0.9rem; opacity: 0.6; color: var(--kiosk-fg); }
</style>
