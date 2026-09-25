# Working agreement — Classroom Pass Tracker

Read in this order: [docs/SPEC.md](docs/SPEC.md) (product intent) →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (design decisions, flows, data model) →
[docs/contain-css-svelte-AGENTS.md](docs/contain-css-svelte-AGENTS.md) (UI library guide).

## Where things stand (2026-09-25, second session)

The first session ran locally (Firebase project `iacs-pass-tracker`, Firestore nam5, rules and indexes deployed,
web app registered; Tom's pending console steps are in [docs/firebase-setup.md](docs/firebase-setup.md)).
The second session, in the cloud, built the whole build order below:

- **`shared/`**: bell schedules, Aspen period parser, `schoolClock()`, current block, display names, escalation,
  availability, summaries, TSV export, `classRhythm`, Firestore types (`model.ts`), callable contracts (`api.ts`).
- **`functions/src/`**: `room.ts` (ensureTeacher, computeCurrent, buildDisplay, refreshRoom, transaction helpers),
  `passes.ts`, `pairing.ts` (codes, pairKiosk, revoke, heartbeat), `sync.ts`, `controls.ts` (pause, override,
  settings, names). `index.ts` wires every endpoint in `api.ts`. Modules take a `Ctx` (`{db, now}`).
- **Tests**: `rules-tests/` (rules) and `functions/test/` (flows with a pinned clock, plus the vertical slice
  through the real callables) run under `npm run test:emulated`.
- **`web/`**: `/kiosk` (pairing, roster, out state with escalation, paused/offline, wake lock, ambient tree)
  and `/` (sign-in plus emulator dev sign-in, auto/refresh sync, live status/override/pause, connect display,
  needs review, pass log with Copy for Spreadsheet and fixes, rhythm timeline, summaries, names, settings).
  The MVP slice was driven end to end in Chromium against `npm run dev:emulated`.

## Next

- Tom: the console steps in docs/firebase-setup.md, then a first deploy and a real-classroom try.
- Confirm the open questions in ARCHITECTURE.md (HS Wednesday, letters, calendar).
- Not built yet: App Check / pairing throttling, nightly sync, CSV download.

## Build order (done; kept for reference)

1. **Functions** (`functions/src/`): implement the modules below. Each takes `db` and a clock so tests can call them directly.
   - `room.ts`: `ensureTeacher`, `computeCurrent`, `buildDisplay`, `refreshRoom`
   - `passes.ts`: start, return, and teacher corrections
   - `pairing.ts`: code generation, `pairKiosk`, revoke
   - `sync.ts`: `syncRoster`
   - Wire every endpoint in `shared/src/api.ts` in `index.ts`, following the flows in ARCHITECTURE.md.
   - Parse inputs with `schemas[name]`.
   - `SIS_MODE`, `ALLOWED_DOMAIN`, `ONEROSTER_*` are `defineString` params. Bind the OneRoster secrets only on `syncRoster`.
2. **Emulated integration tests** (`rules-tests/` or `functions/test/`, under the `emulated` vitest project).
   The list of required tests is in ARCHITECTURE.md → Testing.
3. **Web: kiosk** (`/kiosk`): pairing screen → roster → out state with escalation → paused/offline
   states → wake lock. Look at it at kiosk scale: readable across a room, touch-friendly.
4. **Web: teacher dashboard** (`/`): sign-in (plus emulator dev sign-in) → sync → live status/override/
   pause → connect display → pass log with Copy for Spreadsheet → names → settings → summaries.
5. The **MVP vertical slice** (SPEC §23) works end to end against the emulators (`npm run dev:emulated`).
6. Second-pass features (SPEC §24): ambient "everyone's here" visual, rhythm timeline.

## Rules

- **This repo is public.** Only synthetic fixtures. No real names, rosters, emails, Aspen ids, tokens,
  or secrets, ever. Firebase *web* config is public by design and fine.
- **Privacy boundary is the product.** Nothing kiosk-readable (`displays/*`, kiosk callable responses)
  may contain Aspen ids, emails, app student ids, or history. Add a test when you touch it.
- Clients never write Firestore. New writes go through a callable plus a transaction. Keep rules deny-by-default.
- All schedule and time math goes through `schoolClock()` (America/New_York). Stored times come from the Functions clock, never the kiosk's.
- UI: follow the Contain idiom (ARCHITECTURE.md → Frontend idiom). Keep components small and `<style>` minimal.
  Use Svelte 5 runes only.
- **Don't deploy from a cloud session.** Tom deploys locally (`docs/firebase-setup.md`). Nothing here
  should need production credentials. Use emulators + `SIS_MODE=fixture`.
- `npm run verify` must pass before you push. Also run `npm run test:emulated` when Java is available.

## Commands

```sh
npm ci                  # lockfile matters: a fresh resolve can hit an npm peer-dep crash with vitest
npm test                # unit tests (anywhere)
npm run test:emulated   # rules + integration tests via firebase emulators:exec (needs Java 11+)
npm run emulators       # emulators only (UI at http://127.0.0.1:4011)
npm run dev:emulated    # emulators + Vite dev server with VITE_USE_EMULATORS=true
npm run verify          # check + unit tests + build
```

`firebase-tools` is a devDependency, so `npx firebase …` works without a global install.
Emulator ports are 9119/5011/8181/4011 (non-default on purpose).
