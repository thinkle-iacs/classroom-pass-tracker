# Classroom Pass Tracker

An ambient classroom display that tracks how long a student has been out of the room.
It's for IACS teachers and supplements the paper pass; it doesn't replace it.

- Students tap their name to go out and tap **I'm Back** when they return.
- The display escalates visibly at 5 and 15 minutes.
- Teachers sign in with Google, and their rosters come from Aspen (OneRoster).
- Teachers pair the classroom computer with a short code. It never logs in as the teacher.
- The kiosk shows abbreviated display names and opaque ids only. Aspen ids and history stay server-side.

See [docs/SPEC.md](docs/SPEC.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
[docs/firebase-setup.md](docs/firebase-setup.md). Contributors (human or agent): start with [CLAUDE.md](CLAUDE.md).

Stack: Svelte 5 + [contain-css-svelte](https://github.com/thinkle/svelte-contain-css), Firebase
(Hosting, Auth, Firestore, Functions), Node 22.
