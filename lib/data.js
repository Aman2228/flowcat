// lib/data.js
//
// Starting point for the CAT planner. NOTHING in here is locked in — every
// value below can be changed from the Settings tab in the app, and Settings
// is where Sana should make changes. This file only decides what a brand-new
// browser starts with (and what "Reset everything" goes back to).
//
// What lives here:
// 1. BLOCK_TYPES / PRIORITIES — the dropdown choices used across the app.
// 2. DEFAULT_SETTINGS — name, exam date, day hours, session + break rhythm.
// 3. DEFAULT_CATEGORIES — the CAT sections and their weekly targets (hours).
// 4. DEFAULT_EVENTS — the recurring weekly routine (meals, tea, Sunday mock).
// 5. DEFAULT_PATTERNS — which sessions each weekday gets, in order.

import { WEEK_ORDER } from "./time";

export const STORAGE_KEY = "flow_cat_state_v1";

export const BLOCK_TYPES = [
  { id: "session", label: "Study session (counts toward targets)" },
  { id: "break", label: "Break / rest" },
  { id: "meal", label: "Meal" },
  { id: "fixed", label: "Fixed commitment / other" },
];

export const EVENT_KINDS = BLOCK_TYPES;

export const PRIORITIES = [
  { id: "important", label: "Important" },
  { id: "moderate", label: "Moderate" },
  { id: "regular", label: "Regular" },
];

export const DISRUPTION_REASONS = [
  "College / work overran",
  "Unplanned outing or guests",
  "Tired or unwell",
  "Power or internet cut",
  "Mock ran long",
  "Lost focus",
  "Poor planning",
  "Other",
];

export const DEFAULT_SETTINGS = {
  name: "Sana",
  examName: "CAT 2026",
  examDate: "2026-11-29",
  timeFormat: "12h", // "12h" or "24h"

  // The window the auto-planner may fill with sessions.
  dayStart: "08:00",
  dayEnd: "21:30",

  // Session + break rhythm. 40 min matches one CAT section's time limit.
  sessionMins: 40,
  minSessionMins: 25, // a leftover gap shorter than this is not turned into a session
  shortBreak: 5,
  longBreak: 15,
  longEvery: 3, // a long break after every N sessions in a row
};

export const DEFAULT_CATEGORIES = [
  {
    id: "varc",
    label: "VARC",
    color: "#8E4EC6",
    target: 11,
    hint: "1–2 RC passages, para-jumbles or odd-one-out. Review every wrong answer.",
  },
  {
    id: "dilr",
    label: "DILR",
    color: "#0E9AA7",
    target: 9,
    hint: "Solve 1–2 sets under time. Note what made you stall or skip.",
  },
  {
    id: "qa",
    label: "QA (Quant)",
    color: "#E8743B",
    target: 13,
    hint: "One topic: quick concept recap, then timed problems. Log weak areas.",
  },
  {
    id: "mock",
    label: "Mock test",
    color: "#D6336C",
    target: 2,
    hint: "Full mock in one sitting, exam conditions, no pauses.",
  },
  {
    id: "analysis",
    label: "Mock analysis",
    color: "#5C6F82",
    target: 3,
    hint: "Review every question: wrong, skipped, and slow-but-right.",
  },
  {
    id: "revision",
    label: "Revision & formulas",
    color: "#4C9F5A",
    target: 5,
    hint: "Formula sheet, error log, vocabulary, shortcuts.",
  },
];

// Recurring weekly routine. Blocks of kind "session" count toward targets;
// meals, breaks and "fixed" blocks are just time you don't want scheduled over.
export const DEFAULT_EVENTS = [
  {
    id: "ev-breakfast",
    title: "Breakfast",
    kind: "meal",
    category: "",
    days: [...WEEK_ORDER],
    start: "08:00",
    end: "08:30",
    detail: "",
  },
  {
    id: "ev-lunch",
    title: "Lunch",
    kind: "meal",
    category: "",
    days: [...WEEK_ORDER],
    start: "13:00",
    end: "13:45",
    detail: "",
  },
  {
    id: "ev-tea",
    title: "Tea and rest",
    kind: "break",
    category: "",
    days: [...WEEK_ORDER],
    start: "16:30",
    end: "17:00",
    detail: "",
  },
  {
    id: "ev-dinner",
    title: "Dinner",
    kind: "meal",
    category: "",
    days: [...WEEK_ORDER],
    start: "20:00",
    end: "20:45",
    detail: "",
  },
  {
    id: "ev-mock",
    title: "Full-length mock (CAT slot 1 timing)",
    kind: "session",
    category: "mock",
    days: ["Sun"],
    start: "08:30",
    end: "10:30",
    detail: "Same rules as the real exam: no phone, no pauses.",
  },
];

// The study sessions each weekday gets, in order through the day. The number
// of sessions IS the length of the list — add or remove slots in Settings to
// make a lighter or heavier day. Tasks you add for a day replace matching
// slots first, so the day never balloons.
const WEEKDAY = ["qa", "dilr", "varc", "qa", "varc", "dilr", "qa", "revision", "varc"];

export const DEFAULT_PATTERNS = {
  Mon: [...WEEKDAY],
  Tue: [...WEEKDAY],
  Wed: [...WEEKDAY],
  Thu: [...WEEKDAY],
  Fri: [...WEEKDAY],
  Sat: ["dilr", "qa", "varc", "dilr", "qa", "varc", "dilr", "qa", "revision", "revision"],
  Sun: ["analysis", "analysis", "revision", "varc", "dilr", "qa"],
};

export function makeDefaultState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    events: DEFAULT_EVENTS.map((e) => ({ ...e, days: [...e.days] })),
    patterns: Object.fromEntries(Object.entries(DEFAULT_PATTERNS).map(([k, v]) => [k, [...v]])),
    plans: {}, // { "2026-09-21": { blocks: [...], updatedAt } } — only days you touched
    tasks: [], // per-day to-do items
    milestones: [], // goals with due dates
    mocks: [], // mock test scores
    disruptions: [], // "something came up" log
  };
}
