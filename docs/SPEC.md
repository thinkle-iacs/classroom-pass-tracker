# Classroom Pass Tracker — Product Spec

> Source of truth for product intent, written by Tom Hinkle (2026-09-25).
> Implementation decisions that refine this spec live in [ARCHITECTURE.md](ARCHITECTURE.md).

## Human-Friendly Overview

### The Problem

Teachers are expected to manage students leaving class for the bathroom and other short trips, generally allowing only one student out at a time. Students already carry a paper pass, and this project would not replace that system.

The problem is that the part teachers are bad at—and shouldn't have to devote much attention to—is keeping track of time.

A student leaves. The teacher continues teaching. Twelve minutes later, it's very easy not to realize that the student is still gone. Across weeks, it's even harder to notice that a particular student is routinely missing significant amounts of instructional time.

### The Idea

Put the unused classroom computer to work as a simple classroom pass display.

At the beginning of class, it automatically knows which class is meeting and displays a limited version of the roster—for example:

    Maya R.
    Finn S.
    Alex P.

A student leaving the room taps their name. The screen immediately changes to something large enough for the teacher to see from across the classroom:

    MAYA R. IS OUT
    6:42

When Maya returns, she taps **I'm Back**.

That's essentially the entire student interaction.

The teacher now has two things they didn't have before:

- an impossible-to-miss visual reminder that someone is out and how long they've been gone;
- an accurate historical record of instructional time missed.

### Keeping the Classroom Display Useful

The display should communicate urgency without encouraging students to treat 15 minutes as an allowance.

A normal pass might simply show the elapsed time. At around five minutes—the point when many teachers would reasonably start wondering where a student is—the display becomes much more noticeable. At 15 minutes, it becomes unmistakable and notes that the school's attendance threshold has been reached.

Those thresholds should be configurable.

When everyone is present, instead of displaying an empty utility screen, the computer can become a quiet ambient classroom display. For example, a slowly evolving fractal could grow while showing:

    Everyone's here · 23:14 together

The intention isn't to rank or shame students. It's to make the classroom's rhythm visible: periods when everyone is together and periods when students are coming and going.

### Teacher Controls

Teachers sign in normally with their school Google accounts. Their classes and rosters come from Aspen, using integrations we already have.

The classroom computer itself is not logged into the teacher's account. Instead, the teacher receives a temporary pairing code—similar to joining a classroom quiz/game—which connects that classroom display to the teacher without exposing the teacher's account.

The teacher can also:

- override the automatically selected class;
- pause new passes;
- automatically prohibit passes during, for example, the first and last 10 minutes of class;
- correct a pass when someone forgets to sign back in;
- customize how a student's name appears on the public display;
- review patterns and total instructional time missed;
- copy records directly into a spreadsheet.

### Privacy by Design

The public display deliberately contains very little student information.

Aspen IDs, local student IDs, SASIDs, email addresses, and other SIS identifiers are never sent to the kiosk. The kiosk operates using identifiers generated solely for this application that cannot independently be connected back to Aspen.

By default, names are abbreviated—for example, Maya R. Teachers can customize them, which is important when the SIS name isn't the name a student actually uses at school. The interface should discourage teachers from putting full legal names on the public display.

The kiosk also doesn't expose historical behavior. It can show that Maya is currently out because everyone physically in the classroom already knows Maya isn't there. It does not announce that Maya has left class 14 times this month or missed 87 minutes. That information is available only to the authenticated teacher.

---

## Technical / Product Specification

### 1. Product Goal

Build a lightweight web application that tracks temporary student departures from class. The system supplements rather than replaces the existing paper-pass procedure.

Primary goals:

1. Make current pass status visible from across the classroom.
2. Enforce the normal one-student-out-at-a-time workflow.
3. Record departure and return times accurately.
4. Surface patterns of missed instructional time to teachers.
5. Require virtually no teacher interaction during normal use.

The basic student interaction should be: **tap name → leave → tap I'm Back**

### 2. Preferred Architecture

Use the existing project ecosystem wherever possible: Firebase Hosting, Firestore, Firebase Authentication, Google authentication for teachers, Aspen OneRoster API, existing school schedule data/parsing, existing component/design system.

Before implementing, search the existing projects for working implementations of Firebase setup/deployment; Google authentication; Aspen/OneRoster API access; Google email → Aspen teacher mapping; teacher/section/roster synchronization; schedule parsing and current-block detection; shared UI components. Do not build parallel infrastructure where working implementations already exist.

*(Done in the first session — see "Prior art" in ARCHITECTURE.md. The relevant code has been ported into this repo.)*

### 3. Identity Model and Privacy Boundary

Aspen's student identifier can be used inside the trusted synchronization/backend layer to identify a student reliably. It must not become the application's public-facing student identifier. Maintain an application-specific student identity mapping:

    Aspen Student ID → private trusted mapping → App Student ID

The app ID should be opaque, non-semantic, and unique to this application.

**Kiosk boundary.** The kiosk must never receive Aspen IDs, SASIDs, local school student IDs, student email addresses, or unnecessary SIS metadata. No such identifier should appear in kiosk URLs, DOM attributes, browser storage, or API payloads accessible to the kiosk. If an even more narrowly scoped/session-specific kiosk identifier is convenient architecturally, use one. The kiosk should know only what it needs to perform the current classroom workflow.

### 4. Student Display Names

When a roster is first synchronized, automatically generate a kiosk-safe display name. Default: **First Name + Last Initial** (Maya R., Finn S., Alex P.). Handle collisions gracefully if two students produce the same display name.

**Teacher customization.** Authenticated teachers can override the kiosk display name for a student (nicknames, preferred names, shortened names, cases where the school name differs from the SIS/legal name). Display a gentle warning such as:

> This name is visible on the classroom display. Use the minimum identifying information necessary; avoid full student names.

Teacher overrides must persist across Aspen roster synchronization and must not be overwritten by a later SIS sync.

### 5. Teacher Authentication

Teachers authenticate through school Google accounts. The application uses the authenticated email to map the teacher to their Aspen identity using existing integration logic. From there, retrieve teacher identity, sections, rosters, relevant schedule information. Historical records and analytics are available only through authenticated teacher/admin interfaces.

### 6. Kiosk Pairing

The classroom kiosk should not require teacher authentication. The teacher dashboard provides an action such as **Connect Classroom Display**, generating a short pairing code (e.g. `ZZQXY3`). The classroom computer opens the kiosk URL and enters this code. After successful pairing, issue an appropriately scoped kiosk credential/token. The pairing code itself should not become a long-term authentication secret. Pairing should survive ordinary page reloads/browser restarts but be revocable from the teacher interface.

### 7. Automatic Class Selection

Use existing schedule infrastructure to determine the current class:

    current date/time → school schedule → current block → teacher's section → current roster

Example: It is C Block → Ms. Smith teaches English 10 C → display that roster.

The teacher dashboard must allow manual override for special schedules, assemblies, swapped classes, unusual events, incorrect schedule data.

### 8. Kiosk: Everyone-Present State

When nobody is out, display the active roster using large touch-friendly controls. Also create an ambient visual state suitable for a screen that remains visible throughout class: slowly evolving/growing fractal or generative pattern; current class information; subtle "everyone present" state; timer showing how long everyone has continuously been together ("Everyone's here · 23:14 together"). The visual should be calm and attractive rather than game-like or distracting. The "together" timer resets after an out student returns. This feature is desirable but should not block the basic functional MVP.

### 9. Keeping the Display Awake

While operating in kiosk mode, request a Screen Wake Lock using the browser's Wake Lock API where supported. Handle acquiring the wake lock; reacquiring it after visibility changes where appropriate; release on leaving kiosk mode; browsers/devices where wake lock is unavailable or denied. Do not use hacks such as fake video playback when a proper browser API is available. The kiosk should clearly recover its active state after ordinary browser/device interruptions.

### 10. Starting a Pass

A student taps their display name. The system: (1) validates that new passes are currently permitted; (2) validates that no other student is currently out; (3) creates the pass transaction; (4) records an authoritative server timestamp; (5) transitions the kiosk to the out state. Do not rely on the kiosk's system clock for stored departure/return times.

### 11. One-Student-Out Enforcement

Normal operation permits one active pass per classroom context. Enforce this server-side/transactionally so simultaneous taps cannot accidentally create multiple passes. When someone is out, normal controls for starting another pass disappear or are disabled. The current student must still be able to return.

### 12. Student-Out State

Readable from across a classroom:

    MAYA R. IS OUT
    04:38
    I'M BACK

The timer updates locally for smooth display but derives from the authoritative stored departure timestamp.

### 13. Time-Based Visual Escalation

Do not present the experience as a countdown toward 15 minutes. Fifteen minutes is not the target duration. Escalate concern as elapsed time increases. Default:

- **0–5 minutes** — normal out state
- **5–15 minutes** — warning state, visually prominent/red
- **15+ minutes** — critical state, dramatically different/deep red or similarly unmistakable

At the critical threshold, display explanatory language, e.g. *"15-minute attendance threshold reached"*. Avoid having the application itself make an authoritative attendance determination or write an absence into the SIS.

Configurable thresholds: `warningAfterMinutes = 5`, `attendanceThresholdMinutes = 15`. School-wide defaults can be established while permitting teacher configuration if desired.

### 14. Ending a Pass

The out student taps **I'M BACK**. The system: (1) records authoritative return timestamp; (2) completes the pass; (3) derives duration; (4) returns to the everyone-present state; (5) begins a new "together" interval. No typing.

### 15. Pass Availability Rules

Teachers need control over whether new passes can currently begin, independent of whether an existing student can return.

- **Scheduled restrictions**, e.g. no new passes during the first 10 / final 10 minutes (configurable).
- **Manual override**: an immediate **Passes Allowed / Passes Paused** control (tests, direct instruction, emergencies). When paused, the kiosk says so clearly ("Passes are paused right now").

An already-out student must always retain the ability to check back in.

### 16. Teacher Live Controls

The teacher sees current kiosk/pass state and can: manually end active pass; invalidate erroneous pass; correct the student associated with a pass where feasible; manually pause/resume new passes; change current section; revoke/reset kiosk pairing. Corrections should retain appropriate metadata rather than silently falsifying the original record.

### 17. Suggested Pass Data Model

    Pass
      id, appStudentId, sectionId, teacherId
      departureTimestamp, returnTimestamp
      status: active | completed | invalidated
      source: kiosk | teacher
      correctionMetadata, createdAt, updatedAt

Duration should be derived from authoritative timestamps. Keep private Aspen ↔ app identity mappings separate from kiosk-accessible data.

### 18. Teacher Analytics

Teachers should eventually be able to answer: Who is leaving class frequently? How much instructional time has a student missed? Are passes getting unusually long? Patterns by day/class? What did the movement of a particular class period look like?

Basic summary metrics: number of passes, total minutes out, average pass duration, passes over warning threshold, passes over attendance threshold. Example:

    Maya R.
    12 passes · 87 minutes out · 7:15 average · 3 over 15 minutes

Never expose this historical information on the public kiosk.

### 19. Class Rhythm Visualization (Phase 2)

Design the data model so a future teacher-facing visualization can reconstruct the rhythm of a class period — together periods visually continuous, student-out intervals interrupting them, totals of time together vs. time with someone out. Not required for the initial vertical slice, but store sufficiently precise timestamps now.

### 20. Spreadsheet Export

No Google Sheets integration for MVP. Provide **Copy for Spreadsheet** (TSV for direct paste into Sheets/Excel). Fields: Date, Student, Class, Departure, Return, Duration (minutes), Warning threshold reached, Attendance threshold reached, Status. CSV download optional.

### 21. Kiosk Security Rules

Treat the kiosk as an untrusted/public client. Its credential authorizes only the operations necessary for its paired classroom. It must not be able to query arbitrary Firestore collections. A kiosk receives only: display names; kiosk-specific opaque identifiers; current section info necessary for display; pass-availability state; current active-pass state; permission to initiate/complete appropriately scoped pass transactions. Never use UI obscurity as authorization. Firestore rules/backend functions must enforce the boundary.

### 22. Failure and Recovery

- **Reload while student is out** — reconstruct state and elapsed timer.
- **Temporary network loss** — visibly indicate offline; do not pretend an uncertain transaction succeeded.
- **Double tap** — idempotent where practical.
- **Student forgets to return** — teacher can close the pass.
- **Wrong student tapped** — teacher can correct or invalidate.
- **Class changes while someone remains out** — do not silently abandon the active record.
- **Stale overnight pass** — surface for teacher resolution rather than showing a student perpetually out.
- **Pairing revoked** — kiosk returns to the pairing screen.

### 23. MVP Vertical Slice

    Teacher Google login → Aspen teacher mapping → Teacher's classes → Current class auto-selected
    → Generate pairing code → Pair unauthenticated kiosk → Display privacy-safe roster
    → Student taps name → Persist departure → Large live timer → Student taps I'M BACK
    → Persist return → Teacher sees completed record

Get this entire flow working before building extensive analytics.

### 24. Second-Pass Features

Once the vertical slice is reliable: configurable 5/15-minute thresholds; automatic first/last-N-minutes restrictions; manual pass pause; teacher display-name overrides; Screen Wake Lock; ambient "everyone's here" visualization/timer; spreadsheet copy/export; aggregate student statistics; class rhythm timeline.

More ambitious analytics, SIS attendance writeback, notifications, school-wide dashboards, etc. should wait until actual classroom use establishes that they're valuable.

## Guiding Principle

This should feel less like an electronic bathroom-pass bureaucracy and more like an ambient classroom-awareness tool. For students, interaction should take roughly a second. For teachers, normal operation should require essentially no attention at all. The application earns its place on the classroom screen by quietly tracking something teachers currently have to remember—and becoming impossible to ignore precisely when the teacher actually needs to notice it.
