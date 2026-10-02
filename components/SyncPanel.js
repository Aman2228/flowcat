"use client";

import { useState } from "react";

// Settings -> Sync: shows why the app says "Offline" and lets you fix/test it.
export default function SyncPanel({ sync }) {
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function run(name, fn) {
    setBusy(name);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(String(e?.message || e));
    }
    setBusy("");
  }

  const statusText = !sync.enabled
    ? "Not syncing: this build has no Supabase keys."
    : { idle: "Connecting…", syncing: "Saving…", synced: "Synced across devices", offline: "Offline" }[sync.status];

  return (
    <section className="panel">
      <h2>Sync</h2>
      <p className="muted">
        Status: <strong>{statusText}</strong>
      </p>

      {sync.error && (
        <div className="syncErr" role="alert">
          <strong>Last error{sync.error.code ? ` (${sync.error.code})` : ""}:</strong> {sync.error.message}
          {sync.error.hint && <p>{sync.error.hint}</p>}
        </div>
      )}

      <div className="btnRow">
        <button className="btn primary" disabled={!!busy} onClick={() => run("test", async () => setResults(await sync.testConnection()))}>
          {busy === "test" ? "Testing…" : "Test connection"}
        </button>
        {sync.enabled && (
          <button className="btn" disabled={!!busy} onClick={() => run("retry", sync.retry)}>
            {busy === "retry" ? "Retrying…" : "Retry now"}
          </button>
        )}
      </div>

      {results && (
        <ul className="plainList" style={{ marginTop: 10 }}>
          {results.map((r) => (
            <li key={r.id} className="listItem">
              <div>
                <strong>{r.ok ? "✓" : "✗"} {r.label}</strong>
                {r.detail && <span className="muted"> {r.detail}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {sync.enabled && (
        <>
          <p className="muted" style={{ marginTop: 14 }}>
            If the test passes but devices disagree, pick which side is right. Upload replaces the server copy with this
            device. Download replaces this device with the server copy (a backup of this device is kept).
          </p>
          <div className="btnRow">
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                window.confirm("Overwrite the server copy with what is on this device?") &&
                run("up", async () => setMessage((await sync.forceUpload()).message))
              }
            >
              Force upload this device
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() =>
                window.confirm("Replace this device with the server copy?") &&
                run("down", async () => setMessage((await sync.forceDownload()).message))
              }
            >
              Force download from server
            </button>
          </div>
        </>
      )}
      {message && <p className="note" role="status">{message}</p>}
    </section>
  );
}
