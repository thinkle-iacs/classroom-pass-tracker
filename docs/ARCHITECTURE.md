# Architecture

Decisions made in the first (local) session, refining [SPEC.md](SPEC.md). Treat
this as the design to implement. Change it deliberately and update this file if
you do.

## Stack

| Layer | Choice | Where |
| --- | --- | --- |
| Frontend | Vite SPA, Svelte 5 runes, [contain-css-svelte](contain-css-svelte-AGENTS.md) ^1.3 | `web/` |
| Backend | Firebase callable Functions v2 (Node 22), bundled with esbuild | `functions/` |
| Shared | zod contracts, domain logic, schedule, fixtures (pure TS, unit tested) | `shared/` |
| Data | Firestore (`nam5`), client **read-only**, all writes through Functions | `firestore.rules` |
| Auth | Firebase Auth: Google for teachers; **custom tokens** for kiosks | |
| Project | `iacs-pass-tracker` (prod), `demo-pass-tracker` (emulators) | `.firebaserc` |

Two routes in one SPA: `/` = teacher dashboard, `/kiosk` = classroom display.
Simple `location.pathname` switch; no router library needed.

## Prior art (already ported; don't rebuild)

| Need | Source in ~/Projects | Ported to |
| --- | --- | --- |
| OneRoster client (token, pagination, teacher-by-email → classes) | `google-classroom-sync-web/functions/src/oneroster.ts` | `functions/src/sis.ts` (read-only subset) |
| Verified school Google identity guard | `google-classroom-sync-web/functions/src/auth.ts` | `functions/src/auth.ts` |
| Bell schedules 2026-27 (HS + per-grade MS) | `chromebook-signout-app/src/ui/scheduling/{bellSchedules,msSchedules}.ts` | `shared/src/schedule/bells.ts` |
| Aspen `periods` string parser | same, `parseScheduleFromSIS` | `shared/src/schedule/periods.ts` |
| Monorepo layout, esbuild Functions bundle, Vite 8 + Contain | `google-classroom-sync-web` | repo root |
| Emulator dev sign-in trick, rules-test style | `supervised-session/packages/teacher-app/src/auth.svelte.ts`, `test-harness/rules.spec.mjs` | to do in `web/`; `rules-tests/` |

**Emulator dev sign-in** (from supervised-session). Use it only when connected to the Auth emulator:

```ts
const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true }));
await signInWithCredential(auth, cred);
```

**Frontend idiom** (Tom's rules, from google-classroom-sync-web/web/src/README.md):
- Keep `<style>` blocks as small as possible. No inline styles and no utility-class soup.
- Theme through CSS custom properties on `:root` (`web/src/theme.css`) or on a wrapping element.
- `<Card>` is an index card, not a general-purpose box.
- Components stay small (≤200–300 lines). Page controllers wire together small, Firebase-free components.
- Check Contain before writing custom CSS. The kiosk's giant timer and escalation colors are legitimately
  bespoke, so keep them in one or two kiosk components.
- Vite 8 + Contain: google-classroom-sync-web needed a small transform for a malformed CSS var in
  Contain 1.2.3 (`web/vite.config.ts` there). Check whether 1.3.0 still needs it before copying.

## Identity & privacy boundary

```
Aspen student sourcedId
   │  studentIdentities/{sha256("aspen-student:"+id)}  ← Functions-only, no rules = no client access
   ▼
appStudentId (random 16-char base64url)       ← used in teachers/{uid}/students, passes
   │  HMAC-SHA256(rooms/{roomId}.displaySalt, appStudentId)[:16]
   ▼
kiosk key "k"                                  ← the ONLY student identifier a kiosk ever sees
```

- `functions/src/identity.ts` implements all three (`appStudentIds`, `kioskKey`, `sectionKeyFor`).
- `displaySalt` rotates on every roster sync (and may rotate on re-pair). So kiosk keys are
  session-scoped and can't be correlated across rooms or over time.
- Section keys are hashes of the Aspen class id. The class id itself is stored only in
  teacher-only `teachers/{uid}/sections/*` (needed for re-sync). It never goes in `displays/*`.
- Kiosk sees display names only (default "Maya R.", teacher override wins, see `shared/src/names.ts`).
- Kiosk never gets history: `displays/{roomId}` holds current state only.

## Firestore collections

Types are in `shared/src/model.ts`. Clients read, Functions write.

| Path | Readable by | Contents |
| --- | --- | --- |
| `teachers/{uid}` | that teacher | email, name, `roomId`, `settings`, `sections` summary (for cheap block resolution) |
| `teachers/{uid}/sections/{sectionKey}` | that teacher | title, grades, periods, parsed `meetings`, `studentIds`, aspenClassId |
| `teachers/{uid}/students/{appStudentId}` | that teacher | given/family name, `defaultDisplayName`, `displayNameOverride` (survives sync) |
| `rooms/{roomId}` | owning teacher | private live state: `paused`, manual override, `current`, `activePass`, `togetherSince`, `displaySalt` |
| `displays/{roomId}` | paired kiosk (get only), owning teacher | kiosk-safe projection: section title, block times, roster `[{k,name}]`, `active`, `paused`, settings |
| `kiosks/{kioskId}` | owning teacher | label, pairedAt, lastSeenAt, `revokedAt` |
| `passes/{passId}` | owning teacher | the record. See `PassDoc`; `corrections[]` keeps the audit trail |
| `studentIdentities/*`, `pairingCodes/*` | nobody | Functions-only |

One **room** per teacher (created on first sign-in or sync). "One student out per classroom
context" means one `activePass` per room. Several kiosks can pair to one room.

## Flows

### Teacher sign-in and roster sync (`syncRoster`)
1. `requirePrincipal` checks for a verified `@innovationcharter.org` Google account (google.com provider).
2. `ensureTeacher`: create `teachers/{uid}` plus a `rooms/{roomId}` (random id, random `displaySalt`) if missing.
3. `sis.classesForTeacher(email)`: exactly one active Aspen teacher must match (existing logic). Keep active classes.
4. For each class, `sis.students(classId)` (keep active only), then `appStudentIds()`.
5. `defaultDisplayNames()` across the teacher's whole roster. Upsert `students/*`, **preserving `displayNameOverride`**.
6. Write `sections/*` (`meetings = parseMeetings(periods)`). Delete sections no longer returned.
   Passes keep their `sectionTitle` snapshot.
7. Write the `teachers/{uid}.sections` summary and `lastSyncAt`. Rotate `displaySalt`, then `refreshRoom(force)`.
8. Batch in chunks under 500 ops. Run sync on dashboard load if `lastSyncAt` is older than ~12h, and on a "Refresh from Aspen" button.
   A nightly scheduled sync is optional later.

`SIS_MODE=fixture` (emulators; `functions/.env.demo-pass-tracker`) swaps in `FixtureSource`,
synthetic data from `shared/src/fixtures.ts`. Any teacher email gets the same classes.

### Kiosk pairing
1. Teacher: `createPairingCode` generates 6 chars from `PAIRING_ALPHABET` (no 0/O/1/I/L) with `crypto.randomInt`.
   It `create()`s `pairingCodes/{code}` = {roomId, teacherUid, expiresAt: now+10min} and retries on collision.
   Show the code big, and live-update the kiosk list so the teacher sees the pairing land.
2. Kiosk at `/kiosk`: code entry, then `pairKiosk({code, label?})` (unauthenticated callable). In a transaction,
   check the code exists and is unexpired, **delete it** (single use), and create `kiosks/{kioskId}`.
   Return `auth.createCustomToken('kiosk_'+kioskId, {kiosk:true, kioskId, roomId})`.
3. Kiosk calls `signInWithCustomToken`. Firebase Auth persistence (IndexedDB) survives reloads and
   restarts. The pairing code is gone; the long-lived credential is the Firebase refresh token.
4. **Revoke** (`revokeKiosk`): set `revokedAt`, `auth.revokeRefreshTokens(uid)`, and touch
   `displays/{roomId}.updatedAt` so live listeners re-evaluate rules and get `permission-denied`.
   The kiosk treats permission-denied (listener or callable) as "unpaired": sign out and show the pairing screen.
5. Brute force: 31⁶ ≈ 887M codes with a 10-min TTL. Add App Check and/or per-IP throttling before wide rollout (not MVP).
6. **Prod gotcha:** `createCustomToken` needs the Functions runtime service account to hold
   *Service Account Token Creator* (`iam.serviceAccounts.signBlob`). See firebase-setup.md.

### Current block (`refreshRoom`)
Pure resolution: `resolveCurrentBlock(teacher.sections, now)` in `shared/src/schedule/current.ts`.
All math is in America/New_York via `schoolClock()`; never use `Date#getHours()` (Functions run in UTC).
- A section meets when its parsed meeting `{day, periodId}` equals a bell period in the schedule for
  the section's grade band (HS vs. MS grade) on that weekday. Letter rotation doesn't matter.
- Rosters appear `LEAD_MINUTES` (10) before a block starts, during passing time.
- Manual override: `rooms.manualSectionKey` counts only when `manualDateKey` = today, so it expires
  overnight. If the chosen section is also scheduled now, use its block times. Otherwise `manual: true`
  with null times, and the start/end windows don't apply.
- `refreshRoom(db, roomId, {force})` in one transaction: read room + teacher, compute `current`, check for a stale
  active pass. If nothing changed and not forced, **write nothing**. Otherwise read the section and students
  (`getAll`), write `rooms.current` and rebuild `displays/{roomId}`.
- Triggered by `kioskHeartbeat` (kiosk calls it every 60s, plus on visibility/online events) and by
  every teacher mutation. Heartbeat returns `serverNow` so the kiosk can compute its clock offset.
  Throttle `kiosks.lastSeenAt` writes to about once per 5 min.
- `block.startAt/endAt` (absolute millis) go into the display, so the kiosk can move between availability
  states between heartbeats without doing timezone math.

### Start a pass (`kioskStartPass({k, requestId})`)
One transaction (reads first, then writes):
1. Kiosk doc exists, isn't revoked, and its `roomId` matches the claims.
2. `passId = sha256(kioskId+':'+requestId)[:24]`. If it already exists, return it. That makes a double tap or retry **idempotent**.
3. Read room and teacher. Recompute `current` from the server clock; don't trust `rooms.current`.
4. If `room.activePass` is set, fail with `failed-precondition` ("Someone is already out").
5. Run `availability({paused, block, manual, nowMinutes, settings})`. If not allowed, fail with the reason code.
6. Read the section. Find the `appStudentId` whose `kioskKey(displaySalt, id) === k`. If none matches, the
   roster or salt changed: fail with `not-found`, and the kiosk re-renders from its listener.
7. Create the pass with `departedAt = Timestamp.now()` (Functions clock is authoritative), `startSource:'kiosk'`, and a
   `studentName` snapshot. Set `room.activePass` and rebuild the display.

### Return (`kioskReturn({k, requestId})`)
If there's no active pass, or the active pass's key ≠ `k`, return ok as a no-op (idempotent, and safe against
a stale kiosk). Otherwise set `returnedAt = now`, `status:'completed'`, `endSource:'kiosk'`, clear `activePass`,
set `togetherSince = now`, and rebuild the display. **Returning never checks availability.**

### Teacher corrections
All in transactions, all appending to `corrections[]` with `{at, by, action, note, previous}`. Nothing
gets silently overwritten.
- `teacherEndPass({passId, returnedAt?})`: `departedAt < returnedAt ≤ now`, `endSource:'teacher'`, clears `needsReview`.
- `invalidatePass({passId, note})`: works on active or completed passes; excluded from analytics.
- `reassignPass({passId, appStudentId, note})`: the new student must be in this teacher's roster.
- If the pass is the room's `activePass`, clear it and reset `togetherSince`.

### Edge cases (spec §22)
- **Stale pass:** during `refreshRoom`, an active pass from an earlier school date or older than 4h gets
  `needsReview: true`, a `flagged-stale` correction, and is removed from `room.activePass` so the kiosk frees up.
  It stays `status:'active'` until the teacher ends it (entering a return time) or invalidates it.
  The dashboard shows a "Needs review" list.
- **Class changes while out:** `activePass` persists across section changes. The display shows the out state
  regardless of which roster is current. The pass keeps its original `sectionKey`.
- **Reload while out:** the display doc holds `active.departedAt`, so the timer is reconstructed from it.
- **Offline:** show a banner from Firestore snapshot metadata (`fromCache`/pending) and `navigator.onLine`.
  Disable name buttons while a callable is in flight or offline. Never show the out state until the callable resolves.

### Kiosk timer and escalation
- `elapsed = (Date.now() + serverOffset) - active.departedAt`, ticking with `requestAnimationFrame` or a 1s interval.
- `escalation(elapsed, settings)` returns normal, warning (≥5), or critical (≥15, shows "15-minute attendance
  threshold reached"). Show elapsed time only, never a countdown.
- Together timer: `since = max(togetherSince, block.startAt)`, so it resets each class.

### Wake lock
A small `wakeLock.svelte.ts` helper: `navigator.wakeLock?.request('screen')`, re-request on
`visibilitychange` to visible, release on leaving kiosk mode, and show a subtle "screen may sleep" note if
unsupported or denied. No video hacks.

## Teacher dashboard (MVP → second pass)
Small components, each ≤300 lines, wired by a page controller:
1. `SignIn`: Google popup with `hd: 'innovationcharter.org'`; emulator dev sign-in in dev.
2. `LiveStatus`: current section and block, an override `<Select>` (section list + "Automatic"),
   a Passes allowed/paused `Toggle`, and the active pass with elapsed time and **End** / **Invalidate** buttons.
3. `ConnectDisplay`: shows the pairing code and paired kiosks with last seen and **Revoke**.
4. `NeedsReview`: stale passes, each with an end-time input or invalidate.
5. `PassLog`: recent passes as a `Table`, with a **Copy for Spreadsheet** button (`passesToTsv`) and a reassign action.
6. `RosterNames`: display-name overrides, with `DISPLAY_NAME_WARNING` always visible and a
   `looksLikeFullName` nudge.
7. `Settings`: thresholds and first/last-N-minutes (`settingsSchema`).
8. `StudentSummary`: `summarizeByStudent`, e.g. "12 passes · 87 minutes out · 7:15 average · 3 over 15 minutes".

Teacher reads use Firestore listeners (`teachers/{uid}`, `rooms/{roomId}`, `displays/{roomId}`,
`kiosks where teacherUid==uid`, `passes where teacherUid==uid orderBy departedAt desc limit N`).
Indexes are in `firestore.indexes.json`.

## Testing
- `npm test`: unit tests for shared logic. Runs anywhere.
- `npm run test:emulated`: rules tests (`rules-tests/`) plus, to do, Functions integration tests against the
  emulators. Needs Java for the Firestore emulator. Put Functions logic in modules that take `db`
  and a clock so tests can call them directly.
- Tests that must exist before calling the MVP done: simultaneous start from two kiosks → one pass;
  double-tap → same passId; revoked kiosk → callable and listener both denied; kiosk payloads contain no
  Aspen ids (assert on the `displays` doc); override survives re-sync; stale pass flagged.
- All fixtures are synthetic. **Never commit real student data.** This repo is public.

## Open questions (for Tom)
- **HS Wednesday:** modeled as Blocks 1–3 + Adv/Lunch with no Block 4. Tom recalls the day ending ~12:40,
  but the extension shows Adv/L until 13:19. Confirm times in `shared/src/schedule/bells.ts`.
- **HS letters per day** come from the extension's 2024 file. They're display-only, so confirm or remove.
- **Holidays, half days, assemblies:** no calendar source exists anywhere in prior art. The manual override covers it for MVP.
- **Cross-listed sections** that meet at the same time: first by key wins, and the teacher can override. Consider merging rosters.
