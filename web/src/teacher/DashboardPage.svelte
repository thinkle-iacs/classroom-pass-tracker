<script lang="ts">
  // Teacher dashboard controller. Components below are Firebase-free; this file
  // owns the listeners and turns their events into callable Functions.
  import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut, type User } from 'firebase/auth';
  import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';
  import { Bar, Button, Inline, Text } from 'contain-css-svelte';
  import { DEFAULT_SETTINGS, effectiveName, type DisplayDoc, type EndpointName, type Endpoints, type KioskDoc, type PassDoc, type RosterStudentDoc, type RoomDoc, type Settings, type TeacherDoc } from '@pass/shared';
  import { connect, errorMessage, useEmulators } from '../lib/firebase';
  import { liveDoc, liveQuery, ticker } from '../lib/live.svelte';
  import { toPassRow, type Millis } from '../lib/records';
  import ConnectDisplay from './ConnectDisplay.svelte';
  import LiveStatus from './LiveStatus.svelte';
  import NeedsReview from './NeedsReview.svelte';
  import PassLog from './PassLog.svelte';
  import RhythmTimeline from './RhythmTimeline.svelte';
  import RosterNames from './RosterNames.svelte';
  import SettingsForm from './SettingsForm.svelte';
  import SignIn from './SignIn.svelte';
  import StudentSummary from './StudentSummary.svelte';

  const SYNC_EVERY_MS = 12 * 60 * 60 * 1000;
  const PASS_LOG_LIMIT = 300;
  const { auth, db, call } = connect('teacher');

  let user = $state<User | null | undefined>(undefined);
  let error = $state('');
  let busy = $state(false);
  let syncing = $state(false);
  let code = $state<{ code: string; expiresAt: number } | null>(null);
  $effect(() => onAuthStateChanged(auth, (u) => { user = u; }));

  const uid = $derived(user?.uid ?? null);
  const teacher = liveDoc<TeacherDoc<Millis>>(() => (uid ? doc(db, 'teachers', uid) : null));
  const roomId = $derived(teacher.value?.roomId ?? null);
  const room = liveDoc<RoomDoc<Millis>>(() => (roomId ? doc(db, 'rooms', roomId) : null));
  const display = liveDoc<DisplayDoc<Millis>>(() => (roomId ? doc(db, 'displays', roomId) : null));
  const kiosks = liveQuery<KioskDoc<Millis>>(() => (uid ? query(collection(db, 'kiosks'), where('teacherUid', '==', uid), orderBy('pairedAt', 'desc')) : null));
  const passDocs = liveQuery<PassDoc<Millis>>(() => (uid && roomId ? query(collection(db, 'passes'), where('teacherUid', '==', uid), orderBy('departedAt', 'desc'), limit(PASS_LOG_LIMIT)) : null));
  const studentDocs = liveQuery<RosterStudentDoc>(() => (uid && roomId ? collection(db, 'teachers', uid, 'students') : null));
  const clock = ticker(1000);

  const passes = $derived(passDocs.value.map(toPassRow));
  const active = $derived(passes.find((p) => p.id === room.value?.activePass?.passId) ?? null);
  const review = $derived(passes.filter((p) => p.needsReview && p.status === 'active'));
  const settings: Settings = $derived(teacher.value?.settings ?? DEFAULT_SETTINGS);
  const roster = $derived(studentDocs.value.filter((s) => s.sectionKeys.length).sort((a, b) => a.familyName.localeCompare(b.familyName) || a.givenName.localeCompare(b.givenName)));
  const choices = $derived(roster.map((s) => ({ id: s.id, name: effectiveName(s) })));

  async function run<K extends EndpointName>(name: K, data: Endpoints[K]['request']): Promise<Endpoints[K]['response'] | undefined> {
    busy = true;
    error = '';
    try { return await call(name, data); } catch (e) { error = errorMessage(e); return undefined; } finally { busy = false; }
  }

  async function sync() {
    syncing = true;
    await run('syncRoster', {});
    syncing = false;
  }
  // First visit, or stale: pull classes from Aspen once per page load.
  let autoSynced = false;
  $effect(() => {
    if (!uid || teacher.fromCache || autoSynced) return;
    const last = teacher.value?.lastSyncAt?.toMillis() ?? 0;
    autoSynced = true;
    if (Date.now() - last > SYNC_EVERY_MS) void sync();
  });

  async function google() {
    error = '';
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: 'innovationcharter.org', prompt: 'select_account' });
    await signInWithPopup(auth, provider).catch((e) => { error = errorMessage(e); });
  }
  // Emulator only (ARCHITECTURE.md): the Auth emulator accepts an unsigned Google credential.
  async function devSignIn(email: string) {
    const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }));
    await signInWithCredential(auth, cred).catch((e) => { error = errorMessage(e); });
  }

  async function createCode() {
    const res = await run('createPairingCode', {});
    if (res) code = res;
  }
  const note = (what: string) => prompt(`Why ${what}? (optional, kept with the record)`, '');
</script>

{#if user === undefined}
  <p>Loading…</p>
{:else if !user}
  <SignIn onGoogle={google} onDev={useEmulators ? devSignIn : null} {error} />
{:else}
  <Bar>
    <h1>Pass Tracker</h1>
    <Inline>
      <Text muted>{user.email}</Text>
      <Button disabled={busy} onclick={sync}>{syncing ? 'Refreshing…' : 'Refresh from Aspen'}</Button>
      <Button onclick={() => signOut(auth)}>Sign out</Button>
    </Inline>
  </Bar>
  <main>
    {#if error}<p role="alert"><Text danger>{error}</Text></p>{/if}
    {#if !teacher.value}
      <p>{syncing ? 'Loading your classes from Aspen…' : 'Setting up…'}</p>
    {:else}
      {#if room.value}
        <LiveStatus sections={teacher.value.sections} manualKey={room.value.manualDateKey === room.value.current?.dateKey ? room.value.manualSectionKey : null}
          current={{ title: display.value?.sectionTitle ?? null, label: display.value?.blockLabel ?? null, manual: display.value?.manual ?? false }}
          paused={room.value.paused} {active} {settings} now={clock.now} {busy}
          onOverride={(sectionKey) => run('setSectionOverride', { sectionKey })}
          onPause={(paused) => run('setPaused', { paused })}
          onEnd={(passId) => run('teacherEndPass', { passId })}
          onInvalidate={(passId) => { const n = note('invalidate this pass'); if (n !== null) run('invalidatePass', { passId, note: n }); }} />
      {/if}
      <NeedsReview passes={review} {busy}
        onEnd={(passId, returnedAt) => run('teacherEndPass', { passId, returnedAt })}
        onInvalidate={(passId) => run('invalidatePass', { passId, note: 'Never closed' })} />
      <ConnectDisplay kiosks={kiosks.value} {code} now={clock.now} {busy} onCreate={createCode}
        onRevoke={(kioskId) => { if (confirm('Disconnect this display? It will go back to the pairing screen.')) run('revokeKiosk', { kioskId }); }} />
      <PassLog {passes} students={choices} {settings} {busy}
        onReassign={(passId, appStudentId) => { const n = note('change the student'); if (n !== null) run('reassignPass', { passId, appStudentId, note: n }); }}
        onInvalidate={(passId) => { const n = note('invalidate this pass'); if (n !== null) run('invalidatePass', { passId, note: n }); }} />
      <RhythmTimeline {passes} now={clock.now} />
      <StudentSummary {passes} {settings} />
      <RosterNames sections={teacher.value.sections} students={roster} {busy} onSave={(appStudentId, displayName) => run('setDisplayName', { appStudentId, displayName })} />
      <SettingsForm {settings} {busy} onSave={(s) => run('updateSettings', { settings: s })} />
    {/if}
  </main>
{/if}
