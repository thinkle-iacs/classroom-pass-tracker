# Working agreement — Classroom Pass Tracker

Read in this order: [docs/SPEC.md](docs/SPEC.md) (product intent) →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (design decisions, flows, data model) →
[docs/contain-css-svelte-AGENTS.md](docs/contain-css-svelte-AGENTS.md) (UI library guide).

## Where things stand (2026-09-25)

The first session ran locally, with access to Tom's prior-art projects and the Firebase CLI.
It did:

- **Firebase project `iacs-pass-tracker` exists.** Firestore (nam5) is created, and rules and indexes are deployed.
  The web app is registered, and its public config is in `web/src/lib/firebase-config.ts`. Console steps still
  pending for Tom are listed in [docs/firebase-setup.md](docs/firebase-setup.md).
- **`shared/` is done and tested:** bell schedules and the Aspen period parser (ported), school-timezone
  clock, current-block resolution, display names + collisions, escalation, availability windows,
  summaries, TSV export, Firestore doc types (`model.ts`), and callable contracts (`api.ts`).
- **`functions/src/`** has `auth.ts` (teacher + kiosk guards), `sis.ts` (OneRoster reader ported from
  google-classroom-sync-web, plus `FixtureSource`), and `identity.ts` (the privacy boundary).
  `index.ts` is a stub.
- **`firestore.rules`** is written and covered by `rules-tests/rules.test.ts`, which passes.
- **`web/`** has only `package.json` and the Firebase config.

## Build next, in this order

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
