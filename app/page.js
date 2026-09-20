"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFlowStore } from "../lib/useFlowStore";
import { generateDayBlocks, getBlocksForDate, regenerateKeepingLogged, shiftBlocks, sortBlocks } from "../lib/planner";
import { addDays, daysUntil, fromMin, longDate, nowMin, shortDate, todayStr, toMin, uid, weekDates } from "../lib/time";
import DayView from "../components/DayView";
import Progress from "../components/Progress";
import Mocks from "../components/Mocks";
import Settings from "../components/Settings";
import { TimerConsole, TimerPanel, useTimer } from "../components/Timer";

const TABS = [
  { id: "day", label: "Plan" },
  { id: "progress", label: "Progress" },
  { id: "mocks", label: "Mocks" },
  { id: "settings", label: "Settings" },
];

const UNDO_LIMIT = 20;

const SYNC_LABEL = {
  idle: "Connecting…",
  syncing: "Saving…",
  synced: "Synced across devices",
  offline: "Offline. Changes are kept here and will sync when you are back online.",
};

export default function HomePage() {
  const { state, update, replace, reset, saveError, sync } = useFlowStore();
  const [tab, setTab] = useState("day");
  const [date, setDate] = useState("");
  const [now, setNow] = useState(null);
  const [pendingFeedback, setPendingFeedback] = useState(null);
  const [undoTick, setUndoTick] = useState(0);
  const undoRef = useRef({}); // { [date]: blocks[][] }

  const timerApi = useTimer();

  useEffect(() => {
    setDate(todayStr());
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  const isToday = date === todayStr();
  const week = useMemo(() => (date ? weekDates(date) : []), [date]);

  const { blocks, draft } = useMemo(() => {
    if (!state || !date) return { blocks: [], draft: true };
    return getBlocksForDate(state, date);
  }, [state, date]);

  // -- Undo -------------------------------------------------------------------

  function pushUndo(d, prevBlocks) {
    const stack = undoRef.current[d] || [];
    undoRef.current[d] = [...stack.slice(-(UNDO_LIMIT - 1)), prevBlocks];
    setUndoTick((t) => t + 1);
  }

  const canUndo = date ? (undoRef.current[date] || []).length > 0 : false;

  const commit = useCallback(
    (nextBlocks) => {
      pushUndo(date, blocks);
      update((s) => ({
        ...s,
        plans: { ...s.plans, [date]: { blocks: sortBlocks(nextBlocks), updatedAt: Date.now() } },
      }));
    },
    [date, blocks, update]
  );

  function undo() {
    const stack = undoRef.current[date] || [];
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    undoRef.current[date] = stack.slice(0, -1);
    setUndoTick((t) => t + 1);
    update((s) => ({ ...s, plans: { ...s.plans, [date]: { blocks: prev, updatedAt: Date.now() } } }));
  }

  // -- Plan editing handlers, passed down to DayView as `H` -------------------

  const H = useMemo(
    () => ({
      setStatus: (id, status) => commit(blocks.map((b) => (b.id === id ? { ...b, status } : b))),

      saveBlock: (id, draftFields) =>
        commit(blocks.map((b) => (b.id === id ? { ...b, ...draftFields, status: draftFields.status || undefined } : b))),

      deleteBlock: (id) => commit(blocks.filter((b) => b.id !== id)),

      duplicateBlock: (id) => {
        const original = blocks.find((b) => b.id === id);
        if (!original) return;
        const len = toMin(original.end) - toMin(original.start);
        const start = original.end;
        const end = fromMin(Math.min(1439, toMin(start) + Math.max(5, len)));
        commit([...blocks, { ...original, id: uid(original.type), start, end, status: undefined, feedback: undefined }]);
      },

      shiftFrom: (fromMinute, delta) => commit(shiftBlocks(blocks, fromMinute, delta)),

      saveFeedback: (id, draftFields) =>
        commit(blocks.map((b) => (b.id === id ? { ...b, status: draftFields.status, feedback: draftFields } : b))),

      undo,

      copyTo: (toDate) => {
        const copied = blocks.map((b) => ({ ...b, id: uid(b.type), status: undefined, feedback: undefined }));
        update((s) => ({ ...s, plans: { ...s.plans, [toDate]: { blocks: sortBlocks(copied), updatedAt: Date.now() } } }));
      },

      regenerate: () => {
        if (!state) return;
        const fresh = generateDayBlocks({
          date,
          settings: state.settings,
          categories: state.categories,
          events: state.events,
          patterns: state.patterns,
          tasks: state.tasks.filter((t) => t.date === date),
          milestones: state.milestones,
        });
        commit(regenerateKeepingLogged(blocks, fresh));
      },

      clearDay: () => commit([]),

      addBlock: (draftBlock) => {
        const status = draftBlock.status || undefined;
        commit([...blocks, { ...draftBlock, id: uid(draftBlock.type || "session"), status }]);
      },

      addTask: (taskObj) => update((s) => ({ ...s, tasks: [{ ...taskObj, id: uid("task") }, ...s.tasks] })),

      deleteTask: (id) => update((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) })),

      placeTask: (task) => {
        const startMin = blocks.length ? toMin(blocks[blocks.length - 1].end) : toMin(state.settings.dayStart);
        const len = state.settings.sessionMins || 40;
        const newBlock = {
          id: uid("session"),
          type: "session",
          start: fromMin(startMin),
          end: fromMin(Math.min(1439, startMin + len)),
          title: task.title,
          detail: task.detail || "",
          category: task.category,
          taskId: task.id,
        };
        commit([...blocks, newBlock]);
      },

      addMilestone: (obj) => update((s) => ({ ...s, milestones: [{ ...obj, id: uid("ms") }, ...s.milestones] })),

      deleteMilestone: (id) => update((s) => ({ ...s, milestones: s.milestones.filter((m) => m.id !== id) })),

      addDisruption: (obj) => {
        update((s) => ({ ...s, disruptions: [{ ...obj, id: uid("dis"), date }, ...s.disruptions] }));
        if (obj.action === "recover") {
          const sessions = Math.max(1, Math.ceil(Number(obj.minutes || 40) / 40));
          const tomorrow = addDays(date, 1);
          update((s) => ({
            ...s,
            tasks: [
              {
                id: uid("task"),
                date: tomorrow,
                category: obj.affected,
                title: `Make-up: ${obj.title}`,
                priority: "important",
                sessions,
              },
              ...s.tasks,
            ],
          }));
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, date, state, commit, undoTick]
  );

  if (!state || !date || !now) {
    return (
      <main className="app">
        <p className="loading">Loading your plan…</p>
      </main>
    );
  }

  const daysLeft = daysUntil(state.settings.examDate);

  return (
    <main className="app">
      <TimerConsole
        api={timerApi}
        onLogSession={(timer) => {
          if (timer.date && timer.date !== date) setDate(timer.date);
          setPendingFeedback(timer.itemId);
        }}
      />

      <header className="topbar">
        <div>
          <div className="logo">FLOW</div>
          <div className="who">
            {state.settings.name} · {state.settings.examName}
          </div>
        </div>
        <div className="countdown">
          <span className="countNum">{Math.max(0, daysLeft)}</span>
          <span className="countLabel">
            day{Math.abs(daysLeft) === 1 ? "" : "s"} {daysLeft >= 0 ? "to go" : "since exam day"}
          </span>
        </div>
      </header>

      {sync.enabled && (
        <div className="syncBar">
          <span className={`syncDot ${sync.status}`} />
          <span>{SYNC_LABEL[sync.status]}</span>
        </div>
      )}

      {saveError && <p className="warnBanner">This browser's storage is full, so your latest change may not be saved. Try clearing old backups.</p>}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "day" && (
        <div className="stack">
          <div className="weekNav">
            <div className="weekNavTop">
              <button className="btn" onClick={() => setDate(addDays(date, -7))}>
                ← Prev week
              </button>
              <span className="weekRange">
                {shortDate(week[0].date)} – {shortDate(week[6].date)}
              </span>
              <button className="btn" onClick={() => setDate(addDays(date, 7))}>
                Next week →
              </button>
              <input className="jumpDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="dayTabs">
              {week.map((w) => {
                const stored = state.plans[w.date];
                const doneCount = stored ? stored.blocks.filter((b) => b.status).length : 0;
                return (
                  <button
                    key={w.date}
                    className={`dayTab ${w.date === date ? "on" : ""} ${w.date === todayStr() ? "today" : ""}`}
                    onClick={() => setDate(w.date)}
                  >
                    <strong>{w.dayName}</strong>
                    <span>{w.label}</span>
                    <span className="dayCount">{doneCount > 0 ? `${doneCount} logged` : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <h1 className="dayHeading">
            {longDate(date)}
            {isToday && <span className="todayTag">Today</span>}
          </h1>

          <DayView
            date={date}
            state={state}
            blocks={blocks}
            draft={draft}
            isToday={isToday}
            now={now}
            H={H}
            canUndo={canUndo}
            timerApi={timerApi}
            pendingFeedback={pendingFeedback}
            onPendingHandled={() => setPendingFeedback(null)}
          >
            <TimerPanel api={timerApi} defaultMinutes={state.settings.sessionMins} />
          </DayView>
        </div>
      )}

      {tab === "progress" && (
        <Progress
          state={state}
          date={date}
          onOpenDate={(d) => {
            setDate(d);
            setTab("day");
          }}
          onGoToSettings={() => setTab("settings")}
        />
      )}

      {tab === "mocks" && <Mocks mocks={state.mocks} update={update} />}

      {tab === "settings" && <Settings state={state} update={update} onReplace={replace} onReset={reset} />}
    </main>
  );
}
