<script lang="ts">
  // Classroom display controller: pairing → live display → pass taps.
  // The kiosk is an untrusted public client. It holds a custom-token session
  // scoped to one room and reads exactly one document, displays/{roomId}.
  import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from 'firebase/auth';
  import { doc, type FirestoreError } from 'firebase/firestore';
  import { connect, errorCode, errorMessage } from '../lib/firebase';
  import { liveDoc, online, ticker } from '../lib/live.svelte';
  import { wakeLock } from '../lib/wakeLock.svelte';
  import KioskMenu from './KioskMenu.svelte';
  import OutScreen from './OutScreen.svelte';
  import PairingScreen from './PairingScreen.svelte';
  import PresentScreen from './PresentScreen.svelte';
  import { kioskAvailability, outState, pendingSettled, togetherSince, withPending, type KioskDisplay, type PendingTap } from './state';

  const HEARTBEAT_MS = 60_000;
  const { auth, db, call } = connect('kiosk');

  let user = $state<User | null | undefined>(undefined);
  let roomId = $state<string | null>(null);
  let serverOffset = $state(0);
  let busy = $state(false);
  let notice = $state('');
  let menuOpen = $state(false);
  /** The tap in flight, shown before the server confirms it (cleared once the display catches up, or on error). */
  let pending = $state.raw<PendingTap | null>(null);
  /** Mid-switch, the old session's permission-denied is expected; don't let it sign out the new one. */
  let switching = false;

  $effect(() => onAuthStateChanged(auth, async (u) => {
    const claims = u ? (await u.getIdTokenResult()).claims : null;
    roomId = claims?.kiosk === true && typeof claims.roomId === 'string' ? claims.roomId : null;
    user = roomId ? u : null;
  }));

  /** Revoked, or the room is gone: back to the pairing screen. */
  async function unpair() {
    if (switching) return;
    roomId = null;
    await signOut(auth);
  }

  /** Revoke this display on the server (best effort: offline, the teacher can still revoke it), then sign out. */
  async function leaveRoom() {
    await call('kioskUnpair', {}).catch(() => {});
    roomId = null;
    await signOut(auth);
  }
  async function guarded(action: () => Promise<void>) {
    switching = true;
    try { await action(); } finally { switching = false; }
  }
  const disconnect = () => guarded(leaveRoom);

  /** Shared rooms: check the new code first, so a typo leaves this display as it was. */
  const switchTo = (code: string) => guarded(async () => {
    const res = await call('pairKiosk', { code }).catch((e) => { throw new Error(errorMessage(e)); });
    await leaveRoom();
    await signInWithCustomToken(auth, res.token);
  });
  const deniedMeansUnpaired = (e: FirestoreError) => { if (e.code === 'permission-denied') void unpair(); };

  const server = liveDoc<KioskDisplay>(() => (roomId ? doc(db, 'displays', roomId) : null), deniedMeansUnpaired);
  const clock = ticker(500);
  const isOnline = online();
  const wake = wakeLock(() => !!roomId);

  const serverNow = $derived(clock.now + serverOffset);
  const display = { get value() { return server.value ? withPending(server.value, pending) : null; } };
  $effect(() => { if (pending && server.value && pendingSettled(server.value, pending)) pending = null; });
  const offline = $derived(!isOnline.value || (server.value != null && server.fromCache));
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

  /**
   * One requestId per tap, so a retried or doubled call can't make two passes.
   * The screen changes at once; the server's answer confirms it or rolls it back.
   */
  async function act(endpoint: 'kioskStartPass' | 'kioskReturn', k: string) {
    if (busy || offline) return;
    busy = true;
    const student = display.value?.roster.find((s) => s.k === k)?.name ?? 'A student';
    const tap: PendingTap = endpoint === 'kioskStartPass' ? { kind: 'out', k, name: student, at: serverNow } : { kind: 'in', k, at: serverNow };
    pending = tap;
    try {
      await call(endpoint, { k, requestId: crypto.randomUUID() });
      // Normally the display snapshot clears it; don't hold a guess forever if it never matches.
      setTimeout(() => { if (pending === tap) pending = null; }, 10_000);
    } catch (e) {
      if (pending === tap) pending = null;
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
    busy={busy || offline} notice={offline ? 'Offline: reconnecting…' : notice} onmenu={() => (menuOpen = true)} onreturn={() => act('kioskReturn', display.value!.active!.k)} />
{:else}
  <PresentScreen display={display.value} available={available!} togetherMs={since == null ? null : serverNow - since}
    notice={offline ? 'Offline: reconnecting…' : notice} disabled={busy || offline} onpick={(k) => act('kioskStartPass', k)}
    onmenu={() => (menuOpen = true)} />
{/if}
{#if roomId}
  <KioskMenu open={menuOpen} onclose={() => (menuOpen = false)} onswitch={switchTo} ondisconnect={disconnect} />
{/if}
{#if roomId && (wake.state === 'unsupported' || wake.state === 'denied')}
  <p class="sleep-note">This screen may go to sleep on its own.</p>
{/if}

<style>
  .sleep-note { position: fixed; bottom: 0.5rem; right: 1rem; margin: 0; font-size: 0.9rem; opacity: 0.6; color: var(--kiosk-fg); }
</style>
