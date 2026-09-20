"use client";

import { useMemo } from "react";
import { todayStr, uid } from "../lib/time";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

function totalOf(m) {
  const parts = [num(m.varc), num(m.dilr), num(m.qa)];
  if (parts.every((p) => p === null)) return null;
  return parts.reduce((sum, p) => sum + (p || 0), 0);
}

function Trend({ points }) {
  if (points.length < 2) return null;
  const w = 360;
  const h = 110;
  const pad = 18;
  const values = points.map((p) => p.total);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.total)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="trend" role="img" aria-label="Mock total scores over time">
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map((p, i) => (
        <g key={p.id}>
          <circle cx={x(i)} cy={y(p.total)} r="4" fill="var(--hl)" stroke="currentColor" strokeWidth="1.5" />
          <text x={x(i)} y={y(p.total) - 9} textAnchor="middle" fontSize="10" fill="currentColor">
            {p.total}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function Mocks({ mocks, update }) {
  const setMocks = (fn) => update((s) => ({ ...s, mocks: fn(s.mocks) }));

  function add() {
    setMocks((list) => [
      {
        id: uid("mock"),
        name: `Mock ${list.length + 1}`,
        date: todayStr(),
        varc: "",
        dilr: "",
        qa: "",
        percentile: "",
        notes: "",
      },
      ...list,
    ]);
  }

  const patch = (id, key, value) => setMocks((list) => list.map((m) => (m.id === id ? { ...m, [key]: value } : m)));
  const remove = (id) => setMocks((list) => list.filter((m) => m.id !== id));

  const scored = useMemo(
    () =>
      mocks
        .map((m) => ({ ...m, total: totalOf(m) }))
        .filter((m) => m.total !== null && m.date)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [mocks]
  );

  const best = scored.length ? Math.max(...scored.map((m) => m.total)) : null;
  const latest = scored.length ? scored[scored.length - 1].total : null;
  const avg = scored.length ? Math.round(scored.reduce((s, m) => s + m.total, 0) / scored.length) : null;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panelHead">
          <h2>Mock tests</h2>
          <button className="btn primary" onClick={add}>
            Add a mock
          </button>
        </div>
        <p className="muted">
          Enter section scores after each mock. The total adds up on its own. Everything in the table is editable.
        </p>

        {scored.length > 0 && (
          <div className="statRow">
            <div className="stat">
              <strong>{mocks.length}</strong>
              <span>mocks logged</span>
            </div>
            <div className="stat">
              <strong>{latest}</strong>
              <span>latest total</span>
            </div>
            <div className="stat">
              <strong>{best}</strong>
              <span>best total</span>
            </div>
            <div className="stat">
              <strong>{avg}</strong>
              <span>average total</span>
            </div>
          </div>
        )}
        <Trend points={scored} />
      </section>

      <section className="panel">
        {mocks.length === 0 ? (
          <p className="muted">No mocks yet. Add one after your next full-length attempt.</p>
        ) : (
          <div className="tableWrap">
            <table className="mockTable">
              <thead>
                <tr>
                  <th>Mock</th>
                  <th>Date</th>
                  <th>VARC</th>
                  <th>DILR</th>
                  <th>QA</th>
                  <th>Total</th>
                  <th>Percentile</th>
                  <th>What to fix</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mocks.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <input aria-label="Mock name" value={m.name} onChange={(e) => patch(m.id, "name", e.target.value)} />
                    </td>
                    <td>
                      <input aria-label="Date" type="date" value={m.date} onChange={(e) => patch(m.id, "date", e.target.value)} />
                    </td>
                    {["varc", "dilr", "qa"].map((k) => (
                      <td key={k}>
                        <input
                          aria-label={k.toUpperCase()}
                          className="narrow"
                          type="number"
                          value={m[k]}
                          onChange={(e) => patch(m.id, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="totalCell">{totalOf(m) ?? "–"}</td>
                    <td>
                      <input
                        aria-label="Percentile"
                        className="narrow"
                        type="number"
                        step="0.01"
                        value={m.percentile}
                        onChange={(e) => patch(m.id, "percentile", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="What to fix"
                        className="notesCell"
                        value={m.notes}
                        placeholder="Weak topics, silly mistakes…"
                        onChange={(e) => patch(m.id, "notes", e.target.value)}
                      />
                    </td>
                    <td>
                      <button className="miniBtn" onClick={() => remove(m.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
