"use client";

// components/LifeLog.js
//
// A second, looser record that sits next to the structured Plan:
//   1. A full timeline for one day — the plan's blocks (with their Done /
//      Partial / Missed marks) plus whatever else got logged, in time order,
//      with the untouched stretches called out instead of hidden.
//   2. A free-form entry form for anything that isn't a study session — its
//      own tag, not tied to the plan's sections, so literally anything can
//      be recorded.
//   3. A whole-history view: every day ever tracked, a streak, all-time
//      hours per section, and a searchable list of everything logged, ever.

import { useMemo, useState } from "react";
import {
  buildTimeline,
  currentStreak,
  getBlocksForDate,
  recentLogs,
  trackedDates,
  weekProgress,
  weekStats,
} from "../lib/planner";
import { addDays, daysUntil, fmtDur, fmtHours, fmtTime, longDate, nowMin, shortDate, todayStr, toMin, fromMin, uid } from "../lib/time";
import { Field, catInfo } from "./ui";

const MOODS = ["low", "medium", "high"];

function roundedNow() {
  const n = nowMin();
  return fromMin(Math.floor(n / 5) * 5);
}

// -- Add / edit form for one free-form entry ----------------------------------

function LogForm({ initial, tagOptions, onSave, onCancel, onDelete }) {
  const [d, setD] = useState({
    title: "",
    tag: tagOptions[0] || "",
    start: roundedNow(),
    hasEnd: true,
    end: fromMin(toMin(roundedNow()) + 15),
    note: "",
    mood: "medium",
    ...initial,
  });
  const [error, setError] = useState("");
  const set = (key, value) => setD((prev) => ({ ...prev, [key]: value }));

  function submit() {
    if (!d.title.trim()) return setError("Give it a title — even one word is enough.");
    if (!d.start) return setError("Set a time.");
    if (d.hasEnd && d.end && toMin(d.end) < toMin(d.start)) return setError("The end time is before the start time.");
    onSave({
      title: d.title.trim(),
      tag: d.tag.trim() || "Log",
      start: d.start,
      end: d.hasEnd ? d.end : "",
      note: d.note.trim(),
      mood: d.mood,
    });
  }

  return (
    <div className="editor">
      <div className="formGrid">
        <Field label="What happened?" className="wide">
          <input
            value={d.title}
            placeholder="e.g. Lost 40 min scrolling after the DILR set"
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="Tag">
          <input list="lifeLogTags" value={d.tag} onChange={(e) => set("tag", e.target.value)} />
          <datalist id="lifeLogTags">
            {tagOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Started">
          <input type="time" value={d.start} onChange={(e) => set("start", e.target.value)} />
        </Field>
        <Field label="Has an end time?">
          <select value={d.hasEnd ? "yes" : "no"} onChange={(e) => set("hasEnd", e.target.value === "yes")}>
            <option value="yes">Yes, it ran for a while</option>
            <option value="no">No, just a moment</option>
          </select>
        </Field>
        {d.hasEnd && (
          <Field label="Ended">
            <input type="time" value={d.end} onChange={(e) => set("end", e.target.value)} />
          </Field>
        )}
        <Field label="How were you feeling?">
          <select value={d.mood} onChange={(e) => set("mood", e.target.value)}>
            {MOODS.map((m) => (
              <option key={m} value={m}>
                {m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note" className="wide">
          <textarea rows={2} value={d.note} placeholder="Anything worth remembering" onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>

      {error && <p className="errorText">{error}</p>}

      <div className="btnRow">
        <button className="btn primary" onClick={submit}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button className="btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// -- One row of the day's timeline --------------------------------------------

function TimelineRow({ item, categories, timeFmt, editingId, onEdit, onClose, onSaveLog, onDeleteLog, onFillGap, tagOptions }) {
  if (item.kind === "gap") {
    const mins = item.end - item.start;
    if (mins < 3) return null;
    return (
      <li className="timelineRow gap">
        <div className="timelineTime">
          <strong>{fmtTime(fromMin(item.start), timeFmt)}</strong>
          <span>
            to {fmtTime(fromMin(item.end), timeFmt)} · {fmtDur(mins)}
          </span>
        </div>
        <div className="timelineBody">
          <span className="muted">Not logged</span>
        </div>
        <button className="miniBtn" onClick={() => onFillGap(item.start, item.end)}>
          Log what happened
        </button>
      </li>
    );
  }

  if (item.kind === "block") {
    const b = item.ref;
    const cat = b.type === "session" ? catInfo(categories, b.category) : null;
    return (
      <li className={`timelineRow block ${b.type}`} style={cat ? { "--cat": cat.color } : undefined}>
        <div className="timelineTime">
          <strong>{fmtTime(b.start, timeFmt)}</strong>
          <span>
            to {fmtTime(b.end, timeFmt)} · {fmtDur(item.end - item.start)}
          </span>
        </div>
        <div className="timelineBody">
          <span className="timelineTitle">{b.title}</span>
          <span className="timelineMeta">
            <span className="planTag">Plan · {b.type}</span>
            {cat && (
              <span className="catChip" style={{ "--cat": cat.color }}>
                {cat.label}
              </span>
            )}
            {b.status && <span className={`statusTag ${b.status}`}>{b.status}</span>}
          </span>
          {b.feedback?.output && <p className="timelineNote">{b.feedback.output}</p>}
        </div>
      </li>
    );
  }

  // kind === "log"
  const l = item.ref;
  const editing = editingId === l.id;
  return (
    <li className="timelineRow log">
      <div className="timelineTime">
        <strong>{fmtTime(l.start, timeFmt)}</strong>
        <span>{l.end ? `to ${fmtTime(l.end, timeFmt)} · ${fmtDur(item.end - item.start)}` : "moment"}</span>
      </div>
      <div className="timelineBody">
        <span className="timelineTitle">{l.title}</span>
        <span className="timelineMeta">
          <span className="tagChip">{l.tag}</span>
          {l.mood && <span className="muted small">felt {l.mood}</span>}
        </span>
        {l.note && <p className="timelineNote">{l.note}</p>}
      </div>
      <button className="miniBtn" onClick={() => onEdit(l.id)}>
        Edit
      </button>

      {editing && (
        <LogForm
          initial={{
            title: l.title,
            tag: l.tag,
            start: l.start,
            hasEnd: !!l.end,
            end: l.end || l.start,
            note: l.note,
            mood: l.mood || "medium",
          }}
          tagOptions={tagOptions}
          onSave={(draft) => {
            onSaveLog(l.id, draft);
            onClose();
          }}
          onCancel={onClose}
          onDelete={() => {
            onDeleteLog(l.id);
            onClose();
          }}
        />
      )}
    </li>
  );
}

// -- Whole-history record ------------------------------------------------------

function HistoryPanel({ state, onOpenDate }) {
  const { plans, logs, categories, settings } = state;
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visible, setVisible] = useState(25);

  const dates = useMemo(() => trackedDates(plans, logs), [plans, logs]);
  const stats = useMemo(() => weekStats(plans, dates), [plans, dates]);
  const progress = useMemo(() => weekProgress(plans, dates), [plans, dates]);
  const streak = useMemo(() => currentStreak(plans, logs, todayStr()), [plans, logs]);
  const totalTarget = categories.reduce((sum, c) => sum + Number(c.target || 0), 0);

  const rows = useMemo(() => {
    const sessionRows = recentLogs(plans, Infinity).map((r) => {
      const cat = catInfo(categories, r.block.category);
      return {
        id: `s-${r.date}-${r.block.id}`,
        date: r.date,
        start: r.block.start,
        title: r.block.title,
        tag: cat.label,
        color: cat.color,
        status: r.block.status,
        note: r.block.feedback?.output || "",
      };
    });
    const logRows = (logs || []).map((l) => ({
      id: `l-${l.id}`,
      date: l.date,
      start: l.start,
      title: l.title,
      tag: l.tag || "Log",
      color: null,
      status: null,
      note: l.note || "",
    }));
    return [...sessionRows, ...logRows].sort(
      (a, b) => (a.date === b.date ? toMin(b.start) - toMin(a.start) : a.date < b.date ? 1 : -1)
    );
  }, [plans, logs, categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!q) return true;
      return `${r.title} ${r.tag} ${r.note}`.toLowerCase().includes(q);
    });
  }, [rows, query, from, to]);

  return (
    <>
      <section className="panel">
        <h2>Your whole record up to exam day</h2>
        <div className="statRow">
          <div className="stat">
            <strong>{dates.length}</strong>
            <span>days tracked{dates.length ? ` since ${shortDate(dates[0])}` : ""}</span>
          </div>
          <div className="stat">
            <strong>{streak}</strong>
            <span>day streak</span>
          </div>
          <div className="stat">
            <strong>{fmtHours(stats.loggedMinutes)}</strong>
            <span>studied all-time of {totalTarget} h/week target</span>
          </div>
          <div className="stat">
            <strong>{stats.done}</strong>
            <span>sessions done</span>
          </div>
          <div className="stat">
            <strong>{stats.missed}</strong>
            <span>missed</span>
          </div>
          <div className="stat">
            <strong>{logs.length}</strong>
            <span>life-log entries</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>All-time hours by section</h2>
        <ul className="targetList">
          {categories.map((c) => {
            const doneH = (progress[c.id] || 0) / 60;
            return (
              <li key={c.id} className="targetRow">
                <div className="targetHead">
                  <strong style={{ "--cat": c.color }} className="catName">
                    {c.label}
                  </strong>
                  <span className="muted">{doneH.toFixed(1).replace(/\.0$/, "")} h all-time</span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Search everything</h2>
        </div>
        <div className="inlineFields">
          <Field label="Search" className="wide">
            <input value={query} placeholder="Title, tag or note" onChange={(e) => setQuery(e.target.value)} />
          </Field>
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {filtered.length === 0 ? (
          <p className="muted" style={{ marginTop: 10 }}>
            Nothing matches yet.
          </p>
        ) : (
          <>
            <ul className="plainList" style={{ marginTop: 10 }}>
              {filtered.slice(0, visible).map((r) => (
                <li key={r.id} className="listItem">
                  <div>
                    <strong style={r.color ? { "--cat": r.color } : undefined} className={r.color ? "catName" : ""}>
                      {r.tag}
                    </strong>
                    {r.status && <span className={`statusTag ${r.status}`}> {r.status}</span>}
                    <span className="muted">
                      {" "}
                      {r.title}
                      {r.note ? ` · ${r.note}` : ""}
                    </span>
                  </div>
                  <button className="miniBtn" onClick={() => onOpenDate(r.date)}>
                    {shortDate(r.date)} · {fmtTime(r.start, settings.timeFormat)}
                  </button>
                </li>
              ))}
            </ul>
            {filtered.length > visible && (
              <button className="linkBtn" style={{ marginTop: 10 }} onClick={() => setVisible((v) => v + 25)}>
                Show more ({filtered.length - visible} left)
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

// -- The whole tab -------------------------------------------------------------

export default function LifeLog({ state, date, onDateChange, onGoToPlan, update }) {
  const { settings, categories, logTags } = state;
  const [showAdd, setShowAdd] = useState(false);
  const [addDefaults, setAddDefaults] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const { blocks } = useMemo(() => getBlocksForDate(state, date), [state, date]);
  const dayLogs = useMemo(() => state.logs.filter((l) => l.date === date), [state.logs, date]);

  const timeline = useMemo(
    () => buildTimeline(blocks, dayLogs, settings.dayStart, settings.dayEnd),
    [blocks, dayLogs, settings.dayStart, settings.dayEnd]
  );

  const tagOptions = useMemo(() => {
    const used = new Set(logTags);
    state.logs.forEach((l) => l.tag && used.add(l.tag));
    return Array.from(used);
  }, [logTags, state.logs]);

  function rememberTag(tag) {
    if (!tag) return;
    update((s) => (s.logTags.includes(tag) ? s : { ...s, logTags: [...s.logTags, tag] }));
  }

  function addLog(entry) {
    rememberTag(entry.tag);
    update((s) => ({ ...s, logs: [{ id: uid("log"), date, createdAt: Date.now(), ...entry }, ...s.logs] }));
    setShowAdd(false);
    setAddDefaults(null);
  }

  function saveLog(id, patch) {
    rememberTag(patch.tag);
    update((s) => ({ ...s, logs: s.logs.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  }

  function deleteLog(id) {
    update((s) => ({ ...s, logs: s.logs.filter((l) => l.id !== id) }));
  }

  function fillGap(startMin, endMin) {
    setEditingId(null);
    setAddDefaults({ start: fromMin(startMin), hasEnd: true, end: fromMin(endMin) });
    setShowAdd(true);
  }

  const isToday = date === todayStr();
  const loggedCount = dayLogs.length;
  const examLeft = daysUntil(settings.examDate);

  return (
    <div className="stack">
      <section className="panel">
        <div className="panelHead">
          <h2>
            {longDate(date)}
            {isToday && (
              <span className="todayTag" style={{ marginLeft: 8 }}>
                Today
              </span>
            )}
          </h2>
          <div className="btnRow" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => onDateChange(addDays(date, -1))}>
              ← Day
            </button>
            <button className="btn" onClick={() => onDateChange(todayStr())} disabled={isToday}>
              Today
            </button>
            <button className="btn" onClick={() => onDateChange(addDays(date, 1))}>
              Day →
            </button>
          </div>
        </div>
        <p className="muted">
          Everything from the plan for this day, plus {loggedCount} thing{loggedCount === 1 ? "" : "s"} you logged
          yourself. Use “Log what happened” on any untracked stretch, or add something any time.
          {examLeft >= 0 && ` ${examLeft} day${examLeft === 1 ? "" : "s"} to ${settings.examName}.`}
        </p>

        <div className="btnRow">
          <button
            className="btn primary"
            onClick={() => {
              setEditingId(null);
              setAddDefaults(null);
              setShowAdd((v) => !v);
            }}
          >
            {showAdd ? "Close" : "Log something"}
          </button>
          <button className="btn" onClick={onGoToPlan}>
            Open this day in Plan
          </button>
        </div>

        {showAdd && (
          <LogForm
            initial={addDefaults || {}}
            tagOptions={tagOptions}
            onSave={addLog}
            onCancel={() => {
              setShowAdd(false);
              setAddDefaults(null);
            }}
          />
        )}

        {timeline.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Nothing for this day yet — the plan window in Settings may be empty, or the whole day is untouched.
          </p>
        ) : (
          <ol className="timeline">
            {timeline.map((item) => (
              <TimelineRow
                key={`${item.kind}-${item.id || item.start}`}
                item={item}
                categories={categories}
                timeFmt={settings.timeFormat}
                editingId={editingId}
                onEdit={(id) => {
                  setEditingId(id);
                  setShowAdd(false);
                }}
                onClose={() => setEditingId(null)}
                onSaveLog={saveLog}
                onDeleteLog={deleteLog}
                onFillGap={fillGap}
                tagOptions={tagOptions}
              />
            ))}
          </ol>
        )}
      </section>

      <HistoryPanel state={state} onOpenDate={(d) => onDateChange(d)} />
    </div>
  );
}
