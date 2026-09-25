# Firebase setup — `iacs-pass-tracker`

## Done (2026-09-25, local session, as thinkle@innovationcharter.org)

- Created Firebase/GCP project **`iacs-pass-tracker`** (project number 603770513882).
- Registered web app "Pass Tracker Web" (`1:603770513882:web:c679f431d766b42e4338e3`).
  Its public config is committed in `web/src/lib/firebase-config.ts`.
- Created Firestore `(default)` database in **nam5**, Native mode.
- Deployed `firestore.rules` and `firestore.indexes.json`.
- `.firebaserc`: `default`/`prod` = `iacs-pass-tracker`, `demo` = `demo-pass-tracker` (emulators).

## Still to do — Tom, in the console (one time)

1. **Blaze billing.** Callable Functions and Secret Manager need it:
   https://console.firebase.google.com/project/iacs-pass-tracker/usage/details
2. **Authentication → Sign-in method → enable Google.** Set the support email.
   https://console.firebase.google.com/project/iacs-pass-tracker/authentication/providers
   The kiosk uses custom tokens, which need no provider toggle.
3. **Authentication → Settings → Authorized domains.** `iacs-pass-tracker.web.app` and
   `.firebaseapp.com` are there by default. Add `localhost` and/or `127.0.0.1` only if you'll
   test *live* auth from a dev server. Emulator mode doesn't need it.
4. **Google Auth Platform consent screen:** set it to **Internal** if the project sits under the
   innovationcharter.org org. The app requests only the default profile/email scopes.
5. **OneRoster secrets.** Run these interactively; the values never go in command arguments or the repo:
   ```sh
   firebase functions:secrets:set ONEROSTER_CLIENT_ID
   firebase functions:secrets:set ONEROSTER_CLIENT_SECRET
   ```
   You can reuse the same Aspen OneRoster client that google-classroom-sync-web / Apps Script uses.
   This app only reads.
6. **Let Functions mint kiosk custom tokens.** In IAM, grant the Functions runtime service account
   (Gen 2 default: `603770513882-compute@developer.gserviceaccount.com`) the role
   **Service Account Token Creator** *on itself* (IAM → Service Accounts → that account →
   Permissions → Grant access). Without this, `pairKiosk` fails in prod with
   `iam.serviceAccounts.signBlob` permission denied. The emulator doesn't need it.
   You may need to do this after the first Functions deploy, once the account exists and is in use.

## Deploying (Tom, locally, after pulling)

```sh
npm ci
npm run verify                   # types, unit tests, builds
npm run test:emulated            # rules + integration tests (needs Java)
firebase deploy --only firestore # rules + indexes
firebase deploy --only functions
firebase deploy --only hosting   # after `npm run build -w web`
```

Functions read public params from `functions/.env.iacs-pass-tracker` (committed, no secrets)
and bind the two OneRoster secrets.

Don't change rules or Functions during class time once teachers are using the app. A bad
deploy lands under a live classroom display.

## Emulators

`npm run emulators` uses the `demo-pass-tracker` project. Ports: auth 9119, functions 5011,
firestore 8181, UI 4011. They're non-default to avoid clashing with other local projects.
`SIS_MODE=fixture` serves synthetic rosters. `scripts/ensure-emulator-secrets.mjs` writes dummy
secrets to the git-ignored `functions/.secret.local`. The Firestore emulator needs Java 11+.
