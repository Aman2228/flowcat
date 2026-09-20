"use client";

import { useEffect, useMemo, useState } from "react";
import { BLOCK_TYPES, PRIORITIES, DISRUPTION_REASONS } from "../lib/data";
import { fmtTime, fmtDur, toMin, fromMin, diffDays, todayStr, addDays, shortDate } from "../lib/time";
import { blockMinutes, findOverlaps } from "../lib/planner";
import { CategorySelect, CatChip, Field, NumInput, catInfo } from "./ui";

const STATUS_LABEL = { done: "Done", partial: "Partial", missed: "Missed" };

// -- One block's editor (used for both "edit" and "add") -----------------------

function BlockEditor({ initial, categories, mode, onSave, onCancel, onDelete, onDuplicate, onShift }) {
  const [d, setD] = useState({
    type: "session",
    title: "",
    category: categories[0]?.id || "",
    start: "",
    end: "",
    detail: "",
    status: "",
    ...initial,
  });
  const [error, setError] = useState("");
  const set = (key, value) => setD((prev) => ({ ...prev, [key]: value }));

  function submit() {
    if (!d.title.trim()) return setError("Give this block a title.");
    if (!d.start || !d.end) return setError("Set a start and an end time.");
    if (toMin(d.end) <= toMin(d.start)) return setError("The end time has to be after the start time.");
    onSave({ ...d, title: d.title.trim(), category: d.type === "session" ? d.category : "" });
  }

  function shift(delta) {
    onShift(delta);
    setD((prev) => ({
      ...prev,
      start: fromMin(toMin(prev.start) + delta),
      end: fromMin(toMin(prev.end) + delta),
    }));
  }

  return (
    <div className="editor">
      <div className="formGrid">
        <Field label="Type">
          <select value={d.type} onChange={(e) => set("type", e.target.value)}>
            {BLOCK_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            value={d.title}
            placeholder="e.g. Geometry: triangles and circles"
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        {d.type === "session" && (
          <Field label="Section">
            <CategorySelect categories={categories} value={d.category} onChange={(v) => set("category", v)} />
          </Field>
        )}
        <Field label="Starts">
          <input type="time" value={d.start} onChange={(e) => set("start", e.target.value)} />
        </Field>
        <Field label="Ends">
          <input type="time" value={d.end} onChange={(e) => set("end", e.target.value)} />
        </Field>
        {mode === "add" && (
          <Field label="Already happened?">
            <select value={d.status || ""} onChange={(e) => set("status", e.target.value)}>
              <option value="">Not yet</option>
              <option value="done">Done</option>
              <option value="partial">Partial</option>
              <option value="missed">Missed</option>
            </select>
          </Field>
        )}
        <Field label="Notes" className="wide">
          <input value={d.detail} placeholder="Anything worth remembering" onChange={(e) => set("detail", e.target.value)} />
        </Field>
      </div>

      {error && <p className="errorText">{error}</p>}

      <div className="btnRow">
        <button className="btn primary" onClick={submit}>
          {mode === "add" ? "Add to plan" : "Save changes"}
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        {mode === "edit" && (
          <>
            <button className="btn" onClick={onDuplicate}>
              Duplicate
            </button>
            <button className="btn danger" onClick={onDelete}>
              Delete
            </button>
          </>
        )}
      </div>

      {mode === "edit" && (
        <div className="shiftRow">
          <span className="muted">Move this and everything after it:</span>
          {[-15, -5, 5, 15].map((n) => (
            <button key={n} className="chipBtn" onClick={() => shift(n)}>
              {n > 0 ? `+${n}` : `−${Math.abs(n)}`} min
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// -- "How did it go?" form -----------------------------------------------------

function FeedbackForm({ block, onSave, onCancel }) {
  const fb = block.feedback || {};
  const [d, setD] = useState({
    status: block.status || "done",
    output: fb.output || "",
    nextStep: fb.nextStep || "",
    energy: fb.energy || "medium",
    attempted: fb.attempted ?? "",
    correct: fb.correct ?? "",
  });
  const set = (key, value) => setD((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="editor">
      <div className="formGrid">
        <Field label="How did it go?">
          <select value={d.status} onChange={(e) => set("status", e.target.value)}>
            <option value="done">Done</option>
            <option value="partial">Partial</option>
            <option value="missed">Missed</option>
          </select>
        </Field>
        <Field label="Energy">
          <select value={d.energy} onChange={(e) => set("energy", e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Questions attempted">
          <NumInput value={d.attempted} min={0} onChange={(v) => set("attempted", v)} />
        </Field>
        <Field label="Correct">
          <NumInput value={d.correct} min={0} onChange={(v) => set("correct", v)} />
        </Field>
        <Field label="What did you actually do?" className="wide">
          <textarea
            rows={2}
            value={d.output}
            placeholder="e.g. 2 RC passages, got stuck on inference questions"
            onChange={(e) => set("output", e.target.value)}
          />
        </Field>
        <Field label="Next step" className="wide">
          <input value={d.nextStep} placeholder="e.g. Redo the wrong ones tomorrow" onChange={(e) => set("nextStep", e.target.value)} />
        </Field>
      </div>
      <div className="btnRow">
        <button className="btn primary" onClick={() => onSave(d)}>
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// -- One row of the plan -------------------------------------------------------

function BlockRow({
  block,
  categories,
  timeFmt,
  timeState,
  clash,
  editing,
  giving,
  H,
  onEdit,
  onFeedback,
  onClose,
  onTimer,
}) {
  const cat = block.type === "session" ? catInfo(categories, block.category) : null;
  const mins = blockMinutes(block);
  const fb = block.feedback;

  return (
    <li
      className={`block ${block.type} ${timeState} ${block.status || ""} ${clash ? "clash" : ""}`}
      style={cat ? { "--cat": cat.color } : undefined}
    >
      <div className="blockTime">
        <strong>{fmtTime(block.start, timeFmt)}</strong>
        <span>
          to {fmtTime(block.end, timeFmt)} · {fmtDur(mins)}
        </span>
      </div>

      <div className="blockBody">
        <div className="blockTitle">
          <span className="titleText">{block.title}</span>
          {timeState === "current" && <span className="nowTag">Now</span>}
        </div>
        <div className="blockMeta">
          {cat && <CatChip cat={cat} />}
          {block.status && <span className={`statusTag ${block.status}`}>{STATUS_LABEL[block.status]}</span>}
          {clash && <span className="clashTag">Overlaps another block</span>}
        </div>
        {block.detail && <p className="blockDetail">{block.detail}</p>}
        {fb && (fb.output || fb.nextStep || Number(fb.attempted) > 0) && (
          <p className="blockFeedback">
            {fb.output}
            {Number(fb.attempted) > 0 && ` · ${fb.correct || 0}/${fb.attempted} correct`}
            {fb.nextStep && ` · Next: ${fb.nextStep}`}
          </p>
        )}
      </div>

      <div className="blockActions">
        {block.type === "session" && (
          <div className="segmented" role="group" aria-label="Log this session">
            {["done", "partial", "missed"].map((s) => (
              <button
                key={s}
                aria-pressed={block.status === s}
                className={block.status === s ? `on ${s}` : ""}
                onClick={() => H.setStatus(block.id, s)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        )}
        <div className="miniRow">
          <button className="miniBtn" onClick={() => onTimer(block)}>
            Timer
          </button>
          {block.type === "session" && (
            <button className="miniBtn" onClick={() => onFeedback(block.id)}>
              Note
            </button>
          )}
          <button className="miniBtn" onClick={() => onEdit(block.id)}>
            Edit
          </button>
        </div>
      </div>

      {editing && (
        <BlockEditor
          mode="edit"
          initial={block}
          categories={categories}
          onSave={(draft) => {
            H.saveBlock(block.id, draft);
            onClose();
          }}
          onCancel={onClose}
          onDelete={() => {
            H.deleteBlock(block.id);
            onClose();
          }}
          onDuplicate={() => {
            H.duplicateBlock(block.id);
            onClose();
          }}
          onShift={(delta) => H.shiftFrom(toMin(block.start), delta)}
        />
      )}

      {giving && (
        <FeedbackForm
          block={block}
          onSave={(draft) => {
            H.saveFeedback(block.id, draft);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    </li>
  );
}

// -- "Right now" strip ---------------------------------------------------------

function NowStrip({ blocks, nowMinutes, timeFmt, categories, onTimer }) {
  const current = blocks.find((b) => toMin(b.start) <= nowMinutes && nowMinutes < toMin(b.end));
  const next = blocks.find((b) => toMin(b.start) > nowMinutes);
  const cat = current && current.type === "session" ? catInfo(categories, current.category) : null;

  return (
    <section className="nowStrip" style={cat ? { "--cat": cat.color } : undefined}>
      {current ? (
        <div className="nowMain">
          <div>
            <div className="nowLabel">Right now</div>
            <div className="nowTitle">{current.title}</div>
            <div className="muted">
              {fmtTime(current.start, timeFmt)} to {fmtTime(current.end, timeFmt)}
              {" · "}
              {toMin(current.end) - nowMinutes} min left
            </div>
          </div>
          <button className="btn primary" onClick={() => onTimer(current)}>
            Start timer
          </button>
        </div>
      ) : (
        <div className="nowMain">
          <div>
            <div className="nowLabel">Right now</div>
            <div className="nowTitle">Nothing scheduled</div>
            <div className="muted">Free time. Add a block below if you want to use it.</div>
          </div>
        </div>
      )}
      {next && (
        <div className="nowNext">
          Next: {fmtTime(next.start, timeFmt)} · {next.title}
        </div>
      )}
    </section>
  );
}

// -- Plan toolbar (add / shift / undo / more) ----------------------------------

function PlanToolbar({ draft, isToday, nowMinutes, dayStart, H, canUndo, onAdd, showAdd }) {
  const [shiftFrom, setShiftFrom] = useState("");
  const [shiftBy, setShiftBy] = useState(15);
  const [copyTo, setCopyTo] = useState("");

  const fromValue = shiftFrom || (isToday ? fromMin(nowMinutes) : dayStart);

  return (
    <div className="toolbar">
      <div className="btnRow">
        <button className="btn primary" onClick={onAdd}>
          {showAdd ? "Close" : "Add a block"}
        </button>
        <button className="btn" onClick={H.undo} disabled={!canUndo}>
          Undo
        </button>
        <details className="moreMenu">
          <summary className="btn">Shift, copy, reset</summary>
          <div className="moreBody">
            <div className="moreGroup">
              <strong>Running early or late?</strong>
              <p className="muted">Move every block that starts at or after a time. Use a minus number to pull things earlier.</p>
              <div className="inlineFields">
                <Field label="From">
                  <input type="time" value={fromValue} onChange={(e) => setShiftFrom(e.target.value)} />
                </Field>
                <Field label="By (minutes)">
                  <NumInput value={shiftBy} min={-600} max={600} onChange={setShiftBy} />
                </Field>
                <button className="btn" onClick={() => H.shiftFrom(toMin(fromValue), Number(shiftBy) || 0)}>
                  Shift
                </button>
              </div>
            </div>

            <div className="moreGroup">
              <strong>Copy this day's plan</strong>
              <div className="inlineFields">
                <Field label="To date">
                  <input type="date" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} />
                </Field>
                <button className="btn" disabled={!copyTo} onClick={() => H.copyTo(copyTo)}>
                  Copy
                </button>
              </div>
            </div>

            <div className="moreGroup">
              <strong>Start over</strong>
              <div className="btnRow">
                <button className="btn" onClick={H.regenerate}>
                  Rebuild from my template
                </button>
                <button className="btn danger" onClick={H.clearDay}>
                  Clear the whole day
                </button>
              </div>
              <p className="muted">Rebuilding keeps anything you have already logged. You can undo either one.</p>
            </div>
          </div>
        </details>
      </div>
      <p className="muted small">
        {draft
          ? "Auto-planned from your template. Change anything and this day becomes yours."
          : "This day is saved as you edited it."}
      </p>
    </div>
  );
}

// -- Tasks ---------------------------------------------------------------------

function TaskPanel({ date, tasks, blocks, draft, categories, H }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: categories[0]?.id || "", title: "", priority: "important", sessions: 1 });

  function save() {
    if (!form.title.trim()) return;
    H.addTask({ ...form, title: form.title.trim(), date });
    setForm({ ...form, title: "", sessions: 1 });
    setOpen(false);
  }

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>Tasks for this day</h2>
        <button className="linkBtn" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Add task"}
        </button>
      </div>

      {open && (
        <div className="editor">
          <div className="formGrid">
            <Field label="Section">
              <CategorySelect categories={categories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            </Field>
            <Field label="Task">
              <input
                value={form.title}
                placeholder="e.g. Percentages: 30 timed questions"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sessions needed">
              <NumInput value={form.sessions} min={1} max={12} onChange={(v) => setForm({ ...form, sessions: v })} />
            </Field>
          </div>
          <div className="btnRow">
            <button className="btn primary" onClick={save}>
              Save task
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="muted">
          No tasks yet. The day follows your weekly pattern. Add a task and it takes the place of a matching session.
        </p>
      ) : (
        <ul className="plainList">
          {tasks.map((task) => {
            const placed = blocks.some((b) => b.taskId === task.id);
            return (
              <li key={task.id} className="listItem">
                <div>
                  <strong>{task.title}</strong>
                  <span className="muted">
                    {catInfo(categories, task.category).label} · {task.priority} · {task.sessions} session(s)
                    {placed ? " · in the plan" : draft ? " · will be auto-placed" : ""}
                  </span>
                </div>
                <div className="miniRow">
                  {!placed && !draft && (
                    <button className="miniBtn" onClick={() => H.placeTask(task)}>
                      Put in plan
                    </button>
                  )}
                  <button className="miniBtn" onClick={() => H.deleteTask(task.id)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// -- Goals with due dates ------------------------------------------------------

function GoalsPanel({ milestones, blocks, draft, categories, H }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: categories[0]?.id || "",
    title: "",
    dueDate: addDays(todayStr(), 7),
    priority: "important",
    sessions: 3,
    notes: "",
  });

  function save() {
    if (!form.title.trim()) return;
    H.addMilestone({ ...form, title: form.title.trim() });
    setForm({ ...form, title: "", notes: "" });
    setOpen(false);
  }

  const sorted = useMemo(() => [...milestones].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [milestones]);

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>Goals and deadlines</h2>
        <button className="linkBtn" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Add goal"}
        </button>
      </div>

      {open && (
        <div className="editor">
          <div className="formGrid">
            <Field label="Section">
              <CategorySelect categories={categories} value={form.category} onChange={(v) => setForm({ ...form, category: v })} />
            </Field>
            <Field label="Goal">
              <input
                value={form.title}
                placeholder="e.g. Finish Arithmetic revision"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Due date">
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </Field>
            <Field label="Sessions needed">
              <NumInput value={form.sessions} min={1} max={60} onChange={(v) => setForm({ ...form, sessions: v })} />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" className="wide">
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
          <p className="muted small">
            In the last 7 days before the due date, sessions are spread over the days left and placed in the plan
            automatically.
          </p>
          <div className="btnRow">
            <button className="btn primary" onClick={save}>
              Save goal
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="muted">Nothing yet. Add mock dates, chapter deadlines, or anything with a due date.</p>
      ) : (
        <ul className="plainList">
          {sorted.map((m) => {
            const left = diffDays(todayStr(), m.dueDate);
            const tone = left < 0 ? "late" : left <= 3 ? "soon" : "";
            const placed = blocks.some((b) => b.taskId === `ms-${m.id}`);
            return (
              <li key={m.id} className="listItem">
                <div>
                  <strong>{m.title}</strong>
                  <span className="muted">
                    {catInfo(categories, m.category).label} · {m.sessions} session(s) · due {shortDate(m.dueDate)}{" "}
                    <span className={`dueTag ${tone}`}>
                      {left < 0 ? "overdue" : left === 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}
                    </span>
                  </span>
                </div>
                <div className="miniRow">
                  {!placed && !draft && (
                    <button
                      className="miniBtn"
                      onClick={() =>
                        H.placeTask({
                          id: `ms-${m.id}`,
                          category: m.category,
                          title: `Goal: ${m.title}`,
                          detail: `Due ${m.dueDate}.${m.notes ? " " + m.notes : ""}`,
                        })
                      }
                    >
                      Put in plan
                    </button>
                  )}
                  <button className="miniBtn" onClick={() => H.deleteMilestone(m.id)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// -- Something came up ---------------------------------------------------------

function DisruptionPanel({ categories, H }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    minutes: 60,
    reason: DISRUPTION_REASONS[0],
    affected: categories[0]?.id || "",
    action: "recover",
    note: "",
  });

  function save() {
    if (!form.title.trim()) return;
    H.addDisruption({ ...form, title: form.title.trim() });
    setForm({ ...form, title: "", note: "" });
    setOpen(false);
  }

  return (
    <section className="panel">
      <div className="panelHead">
        <h2>Something came up?</h2>
        <button className="linkBtn" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Log it"}
        </button>
      </div>
      {!open && (
        <p className="muted">Lost time? Log it and choose what happens to the missed study: make it up tomorrow, or let it go.</p>
      )}
      {open && (
        <div className="editor">
          <div className="formGrid">
            <Field label="What happened?" className="wide">
              <input
                value={form.title}
                placeholder="e.g. Relatives visited in the afternoon"
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Field>
            <Field label="Time lost (minutes)">
              <NumInput value={form.minutes} min={0} max={1440} onChange={(v) => setForm({ ...form, minutes: v })} />
            </Field>
            <Field label="Reason">
              <input list="reasonList" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <datalist id="reasonList">
                {DISRUPTION_REASONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="Which section lost out?">
              <CategorySelect categories={categories} value={form.affected} onChange={(v) => setForm({ ...form, affected: v })} />
            </Field>
            <Field label="What now?">
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                <option value="recover">Make it up tomorrow</option>
                <option value="reduce">Reduce (do a lighter version)</option>
                <option value="replace">Replace with something else</option>
                <option value="drop">Let it go</option>
              </select>
            </Field>
            <Field label="Note" className="wide">
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
          {form.action === "recover" && (
            <p className="muted small">
              This adds a make-up task to tomorrow ({Math.max(1, Math.ceil(Number(form.minutes || 40) / 40))} session
              {Math.ceil(Number(form.minutes || 40) / 40) > 1 ? "s" : ""}). You can edit or delete it afterwards.
            </p>
          )}
          <div className="btnRow">
            <button className="btn primary" onClick={save}>
              Save
            </button>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// -- The whole day tab ---------------------------------------------------------

export default function DayView({
  date,
  state,
  blocks,
  draft,
  isToday,
  now,
  H,
  canUndo,
  timerApi,
  pendingFeedback,
  onPendingHandled,
  children,
}) {
  const { categories, settings } = state;
  const [editingId, setEditingId] = useState(null);
  const [feedbackId, setFeedbackId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const clashes = useMemo(() => findOverlaps(blocks), [blocks]);
  const dayTasks = useMemo(() => state.tasks.filter((t) => t.date === date), [state.tasks, date]);

  // Close open editors when the day changes.
  useEffect(() => {
    setEditingId(null);
    setFeedbackId(null);
    setShowAdd(false);
  }, [date]);

  // The timer's "Log this session" button asks us to open a note form.
  useEffect(() => {
    if (pendingFeedback && blocks.some((b) => b.id === pendingFeedback)) {
      setFeedbackId(pendingFeedback);
      setEditingId(null);
      onPendingHandled();
    }
  }, [pendingFeedback, blocks, onPendingHandled]);

  function startTimerFor(block) {
    const total = blockMinutes(block);
    const isCurrent = isToday && toMin(block.start) <= nowMinutes && nowMinutes < toMin(block.end);
    const minutes = isCurrent ? Math.max(1, toMin(block.end) - nowMinutes) : total || settings.sessionMins;
    const cat = block.type === "session" ? catInfo(categories, block.category) : null;
    timerApi.begin(minutes, {
      date,
      itemId: block.type === "session" ? block.id : null,
      label: block.title,
      color: cat?.color || null,
    });
  }

  const lastEnd = blocks.length ? blocks[blocks.length - 1].end : settings.dayStart;

  return (
    <div className="dayLayout">
      {isToday && (
        <NowStrip
          blocks={blocks}
          nowMinutes={nowMinutes}
          timeFmt={settings.timeFormat}
          categories={categories}
          onTimer={startTimerFor}
        />
      )}

      <div className="dayGrid">
        <div className="dayMain">
          <section className="panel planPanel">
            <PlanToolbar
              draft={draft}
              isToday={isToday}
              nowMinutes={nowMinutes}
              dayStart={settings.dayStart}
              H={H}
              canUndo={canUndo}
              showAdd={showAdd}
              onAdd={() => {
                setShowAdd((v) => !v);
                setEditingId(null);
                setFeedbackId(null);
              }}
            />

            {showAdd && (
              <BlockEditor
                mode="add"
                categories={categories}
                initial={{ start: lastEnd, end: fromMin(Math.min(1439, toMin(lastEnd) + settings.sessionMins)) }}
                onSave={(draftBlock) => {
                  H.addBlock(draftBlock);
                  setShowAdd(false);
                }}
                onCancel={() => setShowAdd(false)}
              />
            )}

            {blocks.length === 0 ? (
              <p className="emptyPlan">
                Nothing planned for this day. Use “Add a block”, or “Shift, copy, reset” to rebuild it from your template.
              </p>
            ) : (
              <ol className="planList">
                {blocks.map((block) => {
                  let timeState = "day";
                  if (isToday) {
                    if (nowMinutes >= toMin(block.end)) timeState = "past";
                    else if (nowMinutes >= toMin(block.start)) timeState = "current";
                    else timeState = "upcoming";
                  }
                  return (
                    <BlockRow
                      key={block.id}
                      block={block}
                      categories={categories}
                      timeFmt={settings.timeFormat}
                      timeState={timeState}
                      clash={clashes.has(block.id)}
                      editing={editingId === block.id}
                      giving={feedbackId === block.id}
                      H={H}
                      onEdit={(id) => {
                        setEditingId(id);
                        setFeedbackId(null);
                        setShowAdd(false);
                      }}
                      onFeedback={(id) => {
                        setFeedbackId(id);
                        setEditingId(null);
                        setShowAdd(false);
                      }}
                      onClose={() => {
                        setEditingId(null);
                        setFeedbackId(null);
                      }}
                      onTimer={startTimerFor}
                    />
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="daySide">
          {children}
          <TaskPanel date={date} tasks={dayTasks} blocks={blocks} draft={draft} categories={categories} H={H} />
          <GoalsPanel milestones={state.milestones} blocks={blocks} draft={draft} categories={categories} H={H} />
          <DisruptionPanel categories={categories} H={H} />
        </aside>
      </div>
    </div>
  );
}
