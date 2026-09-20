# FLOW — CAT 2026 planner

A flexible day-by-day study planner built for Sana, preparing for CAT 2026
(29 November). Nothing is hard-coded: every section, target, weekly routine,
session length, break, and individual block is editable from inside the app.
There's no login and no backend — everything is saved in the browser's
`localStorage`, with a one-click JSON backup/restore in Settings.

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
touches `localStorage`.

## Deploy

Any static/Node host that runs Next.js works (e.g. Vercel). No environment
variables are required — there's no external service to configure.
