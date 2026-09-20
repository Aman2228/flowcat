# FLOW — CAT 2026 planner

A flexible day-by-day study planner built for Sana, preparing for CAT 2026
(29 November). Nothing is hard-coded: every section, target, weekly routine,
session length, break, and individual block is editable from inside the app.
Data is cached in the browser's `localStorage` and, once Supabase is set up
(see below), synced so every device shows the same plan.
There's also a one-click JSON backup/restore in Settings.

## What it does

- **Plan tab** — a day view built automatically from your weekly pattern
  (e.g. "Mon: QA, DILR, VARC, QA, …") and your fixed weekly routine (meals,
  tea, a Sunday mock). Every block — including meals and breaks — can be
  edited, retimed, duplicated, or deleted. Add one-off blocks any time.
  Tasks and goals-with-deadlines slot into the plan automatically, or you can
  place them by hand. A "Something came up?" log records lost time and can
  auto-add a make-up task to tomorrow. Undo is one click; "Rebuild from my
  template" resets a day back to the pattern while keeping anything already
  logged.
- **Progress tab** — this week's totals (sessions done/partial/missed,
  accuracy, hours vs. weekly target per section), recent logged sessions, and
  a log of interruptions.
- **Mocks tab** — a simple, fully-editable table of mock scores (VARC / DILR
  / QA / total / percentile / notes) with a trend chart.
- **Settings tab** — exam name & date, day start/end and session/break
  rhythm, sections and their weekly hour targets (add/rename/recolor/remove
  any section), the weekly routine (meals, classes, the Sunday mock — add or
  remove anything, pick which days it happens), and the session pattern for
  each day of the week (add/remove/reorder slots, or copy one day's pattern
  to the whole week). Backup/restore/reset live here too.
- **Focus timer** — any length, runs across tab switches (driven off a
  wall-clock timestamp so it can't drift), with an optional browser
  notification and chime when it ends.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Data model

See `lib/data.js` for the starting defaults (nothing here is fixed at
runtime — it's only what a fresh browser starts with, and what "Reset
everything" returns to) and `lib/planner.js` for the pure functions that
build a day's blocks from the weekly pattern, routine, tasks and goals, plus
the progress/statistics helpers. `lib/useFlowStore.js` is the only place that
touches `localStorage` or Supabase.

## Sync across devices (Supabase, no login)

1. Create a Supabase project, then run `supabase.sql` in its SQL Editor.
2. Copy `Project URL` and the anon / publishable key (Project Settings -> API)
   into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
   ```

3. `npm run dev`. The first device to open the app uploads what it has; every
   other device then loads that same plan automatically.

There is no sign-in: whoever opens the app sees and edits the one shared plan,
so don't share the link publicly. The database only lets the public key touch
that single row. Without the two variables the app runs browser-only, as
before. Never put the `service_role` / secret key in a `NEXT_PUBLIC_` variable.

## Deploy

Any static/Node host that runs Next.js works (e.g. Vercel). Add the two
`NEXT_PUBLIC_SUPABASE_*` variables in the host's settings and redeploy.
