"use client";

import { useMemo } from "react";
import { weekProgress, weekStats, recentLogs } from "../lib/planner";
import { fmtHours, shortDate, weekDates, fmtTime } from "../lib/time";
import { catInfo } from "./ui";

export default function Progress({ state, date, onOpenDate, onGoToSettings }) {
  const { categories, plans, settings, disruptions } = state;
  const week = useMemo(() => weekDates(date), [date]);
  const dates = useMemo(() => week.map((w) => w.date), [week]);

  const minutes = useMemo(() => weekProgress(plans, dates), [plans, dates]);
  const stats = useMemo(() => weekStats(plans, dates), [plans, dates]);
  const logs = useMemo(() => recentLogs(plans, 10), [plans]);

  const weekDisruptions = disruptions.filter((d) => dates.includes(d.date));
  const lostMinutes = weekDisruptions.reduce((sum, d) => sum + Number(d.minutes || 0), 0);
  const accuracy = stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : null;
  const totalTarget = categories.reduce((sum, c) => sum + Number(c.target || 0), 0);

  return (
    <div className="stack">
      <section className="panel">
        <h2>
          Week of {shortDate(week[0].date)} to {shortDate(week[6].date)}
        </h2>
        <div className="statRow">
          <div className="stat">
            <strong>{fmtHours(stats.loggedMinutes)}</strong>
            <span>studied of {totalTarget} h target</span>
          </div>
          <div className="stat">
            <strong>{stats.done}</strong>
            <span>sessions done</span>
          </div>
          <div className="stat">
            <strong>{stats.partial}</strong>
            <span>partial</span>
          </div>
          <div className="stat">
            <strong>{stats.missed}</strong>
            <span>missed</span>
          </div>
          <div className="stat">
            <strong>{accuracy === null ? "–" : `${accuracy}%`}</strong>
            <span>{stats.attempted > 0 ? `accuracy on ${stats.attempted} questions` : "accuracy (log questions in a session note)"}</span>
          </div>
          <div className="stat">
            <strong>{lostMinutes} min</strong>
            <span>lost to interruptions</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Weekly targets</h2>
          <button className="linkBtn" onClick={onGoToSettings}>
            Change targets
          </button>
        </div>
        <p className="muted small">A done session counts fully and a partial one counts half. Targets are in hours.</p>
        <ul className="targetList">
          {categories.map((c) => {
            const doneH = (minutes[c.id] || 0) / 60;
            const target = Number(c.target || 0);
            const pct = target > 0 ? Math.min(100, (doneH / target) * 100) : 0;
            return (
              <li key={c.id} className="targetRow">
                <div className="targetHead">
                  <strong style={{ "--cat": c.color }} className="catName">
                    {c.label}
                  </strong>
                  <span className="muted">
                    {doneH.toFixed(1).replace(/\.0$/, "")} / {target} h
                  </span>
                </div>
                <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(doneH * 10) / 10} aria-label={c.label}>
                  <div style={{ width: `${pct}%`, background: c.color }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel">
        <h2>Recent sessions</h2>
        {logs.length === 0 ? (
          <p className="muted">Nothing logged yet. Mark a session Done, Partial or Missed in the day plan.</p>
        ) : (
          <ul className="plainList">
            {logs.map(({ date: d, block }) => {
              const cat = catInfo(categories, block.category);
              const fb = block.feedback;
              return (
                <li key={`${d}-${block.id}`} className="listItem">
                  <div>
                    <strong style={{ "--cat": cat.color }} className="catName">
                      {cat.label}
                    </strong>{" "}
                    <span className={`statusTag ${block.status}`}>{block.status}</span>
                    <span className="muted">
                      {block.title}
                      {fb?.output ? ` · ${fb.output}` : ""}
                      {Number(fb?.attempted) > 0 ? ` · ${fb.correct || 0}/${fb.attempted} correct` : ""}
                      {fb?.nextStep ? ` · Next: ${fb.nextStep}` : ""}
                    </span>
                  </div>
                  <button className="miniBtn" onClick={() => onOpenDate(d)}>
                    {shortDate(d)} · {fmtTime(block.start, settings.timeFormat)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Interruptions</h2>
        {disruptions.length === 0 ? (
          <p className="muted">None logged. Use “Something came up?” on the day plan when a day goes sideways.</p>
        ) : (
          <ul className="plainList">
            {disruptions.slice(0, 8).map((d) => (
              <li key={d.id} className="listItem">
                <div>
                  <strong>{d.title}</strong>
                  <span className="muted">
                    Lost {d.minutes || 0} min · {d.reason} · {catInfo(categories, d.affected).label} · {d.action}
                    {d.note ? ` · ${d.note}` : ""}
                  </span>
                </div>
                <button className="miniBtn" onClick={() => onOpenDate(d.date)}>
                  {shortDate(d.date)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
