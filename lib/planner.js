// lib/planner.js
//
// Pure functions — no React, no storage. The app calls these to
//   * build a day from Sana's template (generateDayBlocks),
//   * move things around (shiftBlocks, findOverlaps),
//   * and add up progress (weekProgress, weekStats).
//
// A "block" is plain data and every field of it is editable in the UI:
//   { id, type, start, end, title, detail, category, status?, taskId?, feedback? }
//   type: "session" | "break" | "meal" | "fixed"
//   status: "done" | "partial" | "missed" (only on sessions)

import { toMin, fromMin, dayNameOf, diffDays } from "./time";

export function sortBlocks(blocks) {
  return [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end));
}

export function blockMinutes(block) {
  return Math.max(0, toMin(block.end) - toMin(block.start));
}

export function isLoggable(block) {
  return block.type === "session";
}

const PRIORITY_SCORE = { important: 100, moderate: 60, regular: 25 };

function findCategory(categories, id) {
  return categories.find((c) => c.id === id);
}

// -- Slots -----------------------------------------------------------------
//
// A "slot" is one study session waiting for a time. Slots come from the
// weekday pattern; tasks and nearby goals replace matching pattern slots (or
// get added on the end if the pattern has nothing of that section).

function taskSlots(tasks) {
  const out = [];
  tasks.forEach((task) => {
    const count = Math.max(1, Number(task.sessions || 1));
    for (let i = 0; i < count; i++) {
      out.push({
        category: task.category,
        title: task.title,
        detail: `Priority: ${task.priority}. Session ${i + 1} of ${count}.`,
        taskId: task.id,
        score: PRIORITY_SCORE[task.priority] || 25,
      });
    }
  });
  return out;
}

// A goal due within a week is spread over the days left, so it doesn't pile
// onto a single day.
function milestoneSlots(date, milestones) {
  const out = [];
  milestones.forEach((m) => {
    const left = diffDays(date, m.dueDate);
    if (left < 0 || left > 7) return;
    const total = Math.max(1, Number(m.sessions || 1));
    const perDay = Math.ceil(total / (left + 1));
    const urgency = left <= 1 ? 140 : left <= 3 ? 110 : 80;
    for (let i = 0; i < perDay; i++) {
      out.push({
        category: m.category,
        title: `Goal: ${m.title}`,
        detail: `Due ${m.dueDate}.${m.notes ? " " + m.notes : ""}`,
        taskId: `ms-${m.id}`,
        score: urgency + (PRIORITY_SCORE[m.priority] || 0) / 10,
      });
    }
  });
  return out;
}

function buildSlots({ day, date, patterns, tasks, milestones }) {
  const merged = (patterns[day] || []).map((category) => ({ category }));
  const specials = [...taskSlots(tasks), ...milestoneSlots(date, milestones)].sort(
    (a, b) => b.score - a.score
  );
  const extras = [];
  specials.forEach((slot) => {
    const i = merged.findIndex((s) => !s.taskId && s.category === slot.category);
    if (i >= 0) merged[i] = slot;
    else extras.push(slot);
  });
  return [...merged, ...extras];
}

// -- Generator -------------------------------------------------------------

export function generateDayBlocks({ date, settings, categories, events, patterns, tasks, milestones }) {
  const day = dayNameOf(date);
  const dayStart = toMin(settings.dayStart);
  const dayEnd = toMin(settings.dayEnd);
  const sessionMins = Math.max(5, Number(settings.sessionMins) || 40);
  const minSession = Math.max(5, Number(settings.minSessionMins) || 25);
  const shortBreak = Math.max(0, Number(settings.shortBreak) || 0);
  const longBreak = Math.max(0, Number(settings.longBreak) || 0);
  const longEvery = Math.max(1, Number(settings.longEvery) || 3);

  const blocks = [];
  let counter = 0;
  const nextId = (type, start) => `${date}-${type}-${start}-${counter++}`;

  // 1) Recurring commitments for this weekday become blocks as they are.
  const todays = events
    .filter((e) => (e.days || []).includes(day) && toMin(e.end) > toMin(e.start))
    .sort((a, b) => toMin(a.start) - toMin(b.start));

  todays.forEach((e) => {
    const type = e.kind || "fixed";
    blocks.push({
      id: nextId(type, e.start),
      type,
      start: e.start,
      end: e.end,
      title: e.title,
      detail: e.detail || "",
      category: type === "session" ? e.category || "" : "",
    });
  });

  // 2) The gaps between them (inside the day window) are where sessions go.
  const windows = [];
  let cursor = dayStart;
  todays.forEach((e) => {
    const s = toMin(e.start);
    const end = toMin(e.end);
    if (s > cursor) {
      const wEnd = Math.min(s, dayEnd);
      if (wEnd > cursor) windows.push([cursor, wEnd]);
    }
    cursor = Math.max(cursor, end);
  });
  if (cursor < dayEnd) windows.push([cursor, dayEnd]);

  // 3) Fill the gaps: session, break, session, break… with a long break
  //    every few sessions, until today's slots run out.
  const slots = buildSlots({ day, date, patterns, tasks, milestones });
  let slotIndex = 0;

  windows.forEach(([wStart, wEnd]) => {
    let t = wStart;
    let run = 0;
    while (slotIndex < slots.length && wEnd - t >= minSession) {
      const slot = slots[slotIndex++];
      const cat = findCategory(categories, slot.category);
      const len = Math.min(sessionMins, wEnd - t);

      blocks.push({
        id: nextId("session", fromMin(t)),
        type: "session",
        start: fromMin(t),
        end: fromMin(t + len),
        title: slot.title || cat?.label || "Study session",
        detail: slot.detail || cat?.hint || "",
        category: slot.category || "",
        taskId: slot.taskId || undefined,
      });
      t += len;
      run += 1;

      if (slotIndex >= slots.length) break;
      const remaining = wEnd - t;
      if (remaining <= 0) break;

      const isLong = run % longEvery === 0;
      const gap = isLong ? longBreak : shortBreak;

      if (gap > 0 && remaining - gap >= minSession) {
        blocks.push({
          id: nextId("break", fromMin(t)),
          type: "break",
          start: fromMin(t),
          end: fromMin(t + gap),
          title: isLong ? "Long break" : "Short break",
          detail: "",
          category: "",
        });
        t += gap;
      } else if (gap === 0 && remaining >= minSession) {
        // no breaks configured — sessions run back to back
      } else if (remaining >= 5) {
        blocks.push({
          id: nextId("break", fromMin(t)),
          type: "break",
          start: fromMin(t),
          end: fromMin(wEnd),
          title: "Break",
          detail: "",
          category: "",
        });
        t = wEnd;
      } else {
        t = wEnd;
      }
    }
  });

  return sortBlocks(blocks);
}

// The blocks to show for a date: her saved plan if she has touched that day,
// otherwise a fresh draft built from the current template.
export function getBlocksForDate(state, date) {
  const stored = state.plans[date];
  if (stored) return { blocks: stored.blocks, draft: false };
  return {
    blocks: generateDayBlocks({
      date,
      settings: state.settings,
      categories: state.categories,
      events: state.events,
      patterns: state.patterns,
      tasks: state.tasks.filter((t) => t.date === date),
      milestones: state.milestones,
    }),
    draft: true,
  };
}

// Rebuild a day from the template but keep anything already logged.
export function regenerateKeepingLogged(oldBlocks, freshBlocks) {
  const kept = oldBlocks.filter((b) => b.status);
  const clear = freshBlocks.filter(
    (f) => !kept.some((k) => toMin(f.start) < toMin(k.end) && toMin(k.start) < toMin(f.end))
  );
  return sortBlocks([...kept, ...clear]);
}

// -- Moving things around --------------------------------------------------

// Shift every block that starts at or after `fromMinute` by `delta` minutes.
export function shiftBlocks(blocks, fromMinute, delta) {
  return blocks.map((b) =>
    toMin(b.start) >= fromMinute
      ? { ...b, start: fromMin(toMin(b.start) + delta), end: fromMin(toMin(b.end) + delta) }
      : b
  );
}

// Ids of blocks whose times overlap another block. Overlaps are allowed —
// they're just flagged, so nothing ever blocks an edit.
export function findOverlaps(blocks) {
  const sorted = sortBlocks(blocks);
  const clash = new Set();
  let maxEnd = -1;
  let maxId = null;
  sorted.forEach((b) => {
    const s = toMin(b.start);
    const e = toMin(b.end);
    if (s < maxEnd) {
      clash.add(b.id);
      if (maxId) clash.add(maxId);
    }
    if (e > maxEnd) {
      maxEnd = e;
      maxId = b.id;
    }
  });
  return clash;
}

// -- Progress --------------------------------------------------------------

// Minutes that count toward a target: a "done" session counts fully,
// a "partial" one counts half.
export function blockCredit(block) {
  if (block.type !== "session") return 0;
  const mins = blockMinutes(block);
  if (block.status === "done") return mins;
  if (block.status === "partial") return mins / 2;
  return 0;
}

export function weekProgress(plans, dates) {
  const minutes = {};
  dates.forEach((date) => {
    (plans[date]?.blocks || []).forEach((b) => {
      const credit = blockCredit(b);
      if (credit > 0) minutes[b.category] = (minutes[b.category] || 0) + credit;
    });
  });
  return minutes;
}

export function weekStats(plans, dates) {
  const stats = { done: 0, partial: 0, missed: 0, attempted: 0, correct: 0, loggedMinutes: 0 };
  dates.forEach((date) => {
    (plans[date]?.blocks || []).forEach((b) => {
      if (b.type !== "session" || !b.status) return;
      stats[b.status] += 1;
      stats.loggedMinutes += blockCredit(b);
      const fb = b.feedback;
      if (fb && Number(fb.attempted) > 0) {
        stats.attempted += Number(fb.attempted);
        stats.correct += Math.min(Number(fb.correct || 0), Number(fb.attempted));
      }
    });
  });
  return stats;
}

// Most recent logged sessions across all days, newest first.
export function recentLogs(plans, limit = 10) {
  const rows = [];
  Object.entries(plans).forEach(([date, plan]) => {
    (plan.blocks || []).forEach((b) => {
      if (b.type === "session" && b.status) rows.push({ date, block: b });
    });
  });
  rows.sort((a, b) => (a.date === b.date ? toMin(b.block.start) - toMin(a.block.start) : a.date < b.date ? 1 : -1));
  return rows.slice(0, limit);
}
