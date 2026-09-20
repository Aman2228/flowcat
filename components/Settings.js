"use client";

import { useRef, useState } from "react";
import { EVENT_KINDS } from "../lib/data";
import { WEEK_ORDER, DAY_FULL, uid, fmtHours, toMin, dateToStr } from "../lib/time";
import { CategorySelect, Field, NumInput, catInfo } from "./ui";

const PALETTE = ["#8E4EC6", "#0E9AA7", "#E8743B", "#D6336C", "#5C6F82", "#4C9F5A", "#C9A227", "#3B5BDB", "#B8483B"];

export default function Settings({ state, update, onReplace, onReset }) {
  const { settings, categories, events, patterns } = state;
  const fileRef = useRef(null);
  const [copyFrom, setCopyFrom] = useState("Mon");
  const [message, setMessage] = useState("");

  const setSetting = (key, value) => update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));

  // -- Sections ---------------------------------------------------------------
  const patchCategory = (id, patch) =>
    update((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  function addCategory() {
    update((s) => ({
      ...s,
      categories: [
        ...s.categories,
        { id: uid("cat"), label: "New section", color: PALETTE[s.categories.length % PALETTE.length], target: 0, hint: "" },
      ],
    }));
  }

  function removeCategory(id) {
    const label = catInfo(categories, id).label;
    if (!window.confirm(`Remove "${label}"? Blocks you already logged keep their history, and it is taken out of your daily patterns.`)) return;
    update((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
      patterns: Object.fromEntries(Object.entries(s.patterns).map(([day, list]) => [day, list.filter((c) => c !== id)])),
      events: s.events.map((e) => (e.category === id ? { ...e, category: "" } : e)),
    }));
  }

  // -- Weekly routine -----------------------------------------------------------
  const patchEvent = (id, patch) =>
    update((s) => ({ ...s, events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

  function toggleEventDay(event, day) {
    const has = event.days.includes(day);
    const days = has ? event.days.filter((d) => d !== day) : [...event.days, day];
    patchEvent(event.id, { days: WEEK_ORDER.filter((d) => days.includes(d)) });
  }

  function addEvent() {
    update((s) => ({
      ...s,
      events: [
        ...s.events,
        { id: uid("ev"), title: "New commitment", kind: "fixed", category: "", days: [...WEEK_ORDER], start: "12:00", end: "13:00", detail: "" },
      ],
    }));
  }

  const removeEvent = (id) => update((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) }));

  // -- Daily pattern -------------------------------------------------------------
  const setPattern = (day, list) => update((s) => ({ ...s, patterns: { ...s.patterns, [day]: list } }));

  function changeSlot(day, index, value) {
    setPattern(day, patterns[day].map((c, i) => (i === index ? value : c)));
  }

  function moveSlot(day, index, delta) {
    const list = [...patterns[day]];
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    setPattern(day, list);
  }

  const removeSlot = (day, index) => setPattern(day, patterns[day].filter((_, i) => i !== index));
  const addSlot = (day) => setPattern(day, [...(patterns[day] || []), categories[0]?.id || ""]);

  function copyPattern() {
    update((s) => ({
      ...s,
      patterns: Object.fromEntries(WEEK_ORDER.map((d) => [d, [...s.patterns[copyFrom]]])),
    }));
    setMessage(`Copied ${DAY_FULL[copyFrom]}'s pattern to every day.`);
  }

  // -- Backup ------------------------------------------------------------------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-cat-backup-${dateToStr(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object" || !parsed.settings) throw new Error("Not a FLOW backup");
        if (!window.confirm("Replace everything in this browser with the backup?")) return;
        onReplace(parsed);
        setMessage("Backup restored.");
      } catch (err) {
        setMessage("That file is not a FLOW backup, so nothing was changed.");
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!window.confirm("Reset everything to the starting setup? This deletes your plans, logs, mocks and settings in this browser.")) return;
    onReset();
    setMessage("Everything is back to the starting setup.");
  }

  return (
    <div className="stack">
      <p className="note">
        Nothing here is fixed. Changes apply to days you have not edited yet. For a day you already changed, open it and use
        “Rebuild from my template”.
      </p>

      <section className="panel">
        <h2>You and the exam</h2>
        <div className="formGrid">
          <Field label="Your name">
            <input value={settings.name} onChange={(e) => setSetting("name", e.target.value)} />
          </Field>
          <Field label="Exam name">
            <input value={settings.examName} onChange={(e) => setSetting("examName", e.target.value)} />
          </Field>
          <Field label="Exam date">
            <input type="date" value={settings.examDate} onChange={(e) => setSetting("examDate", e.target.value)} />
          </Field>
          <Field label="Time display">
            <select value={settings.timeFormat} onChange={(e) => setSetting("timeFormat", e.target.value)}>
              <option value="12h">12-hour (8:30 am)</option>
              <option value="24h">24-hour (08:30)</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="panel">
        <h2>Day rhythm</h2>
        <p className="muted">How the auto-planner packs sessions and breaks into the free gaps of a day.</p>
        <div className="formGrid">
          <Field label="Planning starts">
            <input type="time" value={settings.dayStart} onChange={(e) => setSetting("dayStart", e.target.value)} />
          </Field>
          <Field label="Planning ends">
            <input type="time" value={settings.dayEnd} onChange={(e) => setSetting("dayEnd", e.target.value)} />
          </Field>
          <Field label="Session length (min)">
            <NumInput value={settings.sessionMins} min={10} max={240} onChange={(v) => setSetting("sessionMins", v)} />
          </Field>
          <Field label="Shortest session worth planning (min)">
            <NumInput value={settings.minSessionMins} min={5} max={120} onChange={(v) => setSetting("minSessionMins", v)} />
          </Field>
          <Field label="Short break (min)">
            <NumInput value={settings.shortBreak} min={0} max={60} onChange={(v) => setSetting("shortBreak", v)} />
          </Field>
          <Field label="Long break (min)">
            <NumInput value={settings.longBreak} min={0} max={120} onChange={(v) => setSetting("longBreak", v)} />
          </Field>
          <Field label="Long break after every … sessions">
            <NumInput value={settings.longEvery} min={1} max={10} onChange={(v) => setSetting("longEvery", v)} />
          </Field>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Sections and weekly targets</h2>
          <button className="btn" onClick={addCategory}>
            Add a section
          </button>
        </div>
        <p className="muted">Rename them, recolour them, set hours per week, or add your own (GK, current affairs, anything).</p>
        <ul className="plainList">
          {categories.map((c) => (
            <li key={c.id} className="rowCard">
              <div className="formGrid tight">
                <Field label="Name">
                  <input value={c.label} onChange={(e) => patchCategory(c.id, { label: e.target.value })} />
                </Field>
                <Field label="Colour">
                  <input type="color" value={c.color} onChange={(e) => patchCategory(c.id, { color: e.target.value })} />
                </Field>
                <Field label="Target (hours per week)">
                  <NumInput value={c.target} min={0} max={100} step={0.5} onChange={(v) => patchCategory(c.id, { target: v })} />
                </Field>
                <Field label="Default note for its sessions" className="wide">
                  <input value={c.hint || ""} onChange={(e) => patchCategory(c.id, { hint: e.target.value })} />
                </Field>
              </div>
              <button className="miniBtn" onClick={() => removeCategory(c.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Total target: {fmtHours(categories.reduce((sum, c) => sum + Number(c.target || 0) * 60, 0))} per week.
        </p>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Weekly routine</h2>
          <button className="btn" onClick={addEvent}>
            Add to routine
          </button>
        </div>
        <p className="muted">
          Meals, tea, classes, a weekly mock, a walk. The planner works around these. Mark one as a study session and it counts
          toward your targets.
        </p>
        <ul className="plainList">
          {events.map((e) => (
            <li key={e.id} className="rowCard">
              <div className="formGrid tight">
                <Field label="Title">
                  <input value={e.title} onChange={(ev) => patchEvent(e.id, { title: ev.target.value })} />
                </Field>
                <Field label="Type">
                  <select value={e.kind} onChange={(ev) => patchEvent(e.id, { kind: ev.target.value })}>
                    {EVENT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {e.kind === "session" && (
                  <Field label="Section">
                    <CategorySelect categories={categories} value={e.category} onChange={(v) => patchEvent(e.id, { category: v })} />
                  </Field>
                )}
                <Field label="Starts">
                  <input type="time" value={e.start} onChange={(ev) => patchEvent(e.id, { start: ev.target.value })} />
                </Field>
                <Field label="Ends">
                  <input type="time" value={e.end} onChange={(ev) => patchEvent(e.id, { end: ev.target.value })} />
                </Field>
                <Field label="Note" className="wide">
                  <input value={e.detail || ""} onChange={(ev) => patchEvent(e.id, { detail: ev.target.value })} />
                </Field>
              </div>
              <div className="dayChips" role="group" aria-label={`Days for ${e.title}`}>
                {WEEK_ORDER.map((d) => (
                  <button key={d} className={`chipBtn ${e.days.includes(d) ? "on" : ""}`} aria-pressed={e.days.includes(d)} onClick={() => toggleEventDay(e, d)}>
                    {d}
                  </button>
                ))}
              </div>
              {toMin(e.end) <= toMin(e.start) && <p className="errorText">The end time is not after the start time, so this is skipped when planning.</p>}
              <button className="miniBtn" onClick={() => removeEvent(e.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Sessions each day</h2>
        <p className="muted">
          The list is the day. Each item is one study session, in order, starting from the first free gap. Add slots for a
          heavier day, remove slots for a lighter one, reorder with the arrows.
        </p>

        <div className="inlineFields">
          <Field label="Copy the pattern of">
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              {WEEK_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DAY_FULL[d]}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn" onClick={copyPattern}>
            Apply to every day
          </button>
        </div>

        {WEEK_ORDER.map((day) => {
          const list = patterns[day] || [];
          return (
            <div key={day} className="patternDay">
              <div className="patternHead">
                <strong>{DAY_FULL[day]}</strong>
                <span className="muted">
                  {list.length} session{list.length === 1 ? "" : "s"} · about {fmtHours(list.length * (settings.sessionMins || 40))}
                </span>
              </div>
              <div className="slotRow">
                {list.map((cat, i) => {
                  const info = catInfo(categories, cat);
                  return (
                    <div className="slot" key={`${day}-${i}`} style={{ "--cat": info.color }}>
                      <CategorySelect
                        aria-label={`${DAY_FULL[day]} session ${i + 1}`}
                        categories={categories}
                        value={cat}
                        onChange={(v) => changeSlot(day, i, v)}
                      />
                      <div className="slotBtns">
                        <button aria-label="Move earlier" onClick={() => moveSlot(day, i, -1)} disabled={i === 0}>
                          ←
                        </button>
                        <button aria-label="Move later" onClick={() => moveSlot(day, i, 1)} disabled={i === list.length - 1}>
                          →
                        </button>
                        <button aria-label="Remove session" onClick={() => removeSlot(day, i)}>
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button className="chipBtn" onClick={() => addSlot(day)}>
                  Add session
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <p className="muted">
          Everything is saved in this browser only. Download a backup now and then, or to move to another phone or laptop.
        </p>
        <div className="btnRow">
          <button className="btn primary" onClick={exportData}>
            Download backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Restore from backup
          </button>
          <button className="btn danger" onClick={resetAll}>
            Reset everything
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importData} />
        </div>
        {message && <p className="note" role="status">{message}</p>}
      </section>
    </div>
  );
}
