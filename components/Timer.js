"use client";

import { useEffect, useState, useCallback } from "react";

const PRESETS = [25, 40, 50, 60, 90];

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function playChime() {
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const startAt = ctx.currentTime;
    [880, 1108, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = startAt + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch (e) {
    console.error("Could not play timer chime:", e);
  }
}

function notifyDone(label) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  try {
    if (Notification.permission === "granted") {
      new Notification("FLOW: time's up", { body: label ? `${label} is done.` : "Timer finished." });
    }
  } catch (e) {
    // Notifications blocked — the chime is still enough.
  }
}

// The countdown is driven off a wall-clock `endAt`, not a decrementing
// counter. Browsers throttle background tabs, so a counter would drift; this
// is always correct the moment the tab wakes up.
export function useTimer() {
  const [timer, setTimer] = useState(null); // { date, itemId, label, color, duration, endAt, secondsLeft, running }
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!timer || !timer.running) return;

    const tick = () => {
      setTimer((t) => {
        if (!t || !t.running) return t;
        const remaining = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
        if (remaining <= 0) return { ...t, secondsLeft: 0, running: false };
        if (remaining === t.secondsLeft) return t;
        return { ...t, secondsLeft: remaining };
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    const onWake = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [timer?.running, timer?.itemId, timer?.endAt]);

  const finished = !!timer && timer.secondsLeft === 0 && !timer.running;
  useEffect(() => {
    if (finished) {
      playChime();
      notifyDone(timer?.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const begin = useCallback((minutes, extra) => {
    const duration = Math.max(1, Number(minutes) || 40) * 60;
    setTimer({
      date: null,
      itemId: null,
      label: "Focus session",
      color: null,
      ...extra,
      duration,
      endAt: Date.now() + duration * 1000,
      secondsLeft: duration,
      running: true,
    });
    setOpen(true);
  }, []);

  const toggle = useCallback(() => {
    setTimer((t) => {
      if (!t) return t;
      if (t.running) {
        const remaining = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
        return { ...t, running: false, secondsLeft: remaining };
      }
      return { ...t, running: true, endAt: Date.now() + t.secondsLeft * 1000 };
    });
  }, []);

  const adjust = useCallback((deltaMinutes) => {
    setTimer((t) => {
      if (!t) return t;
      const delta = deltaMinutes * 60;
      const duration = Math.max(60, t.duration + delta);
      if (t.running) {
        const endAt = t.endAt + delta * 1000;
        return { ...t, endAt, duration, secondsLeft: Math.max(0, Math.round((endAt - Date.now()) / 1000)) };
      }
      return { ...t, duration, secondsLeft: Math.max(0, t.secondsLeft + delta) };
    });
  }, []);

  const reset = useCallback(() => {
    setTimer((t) => (t ? { ...t, secondsLeft: t.duration, endAt: Date.now() + t.duration * 1000, running: false } : t));
  }, []);

  const stop = useCallback(() => {
    setTimer(null);
    setOpen(false);
  }, []);

  return { timer, open, setOpen, begin, toggle, adjust, reset, stop };
}

export function TimerConsole({ api, onLogSession }) {
  const { timer, open, setOpen, toggle, adjust, reset, stop } = api;
  if (!timer || !open) return null;

  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const progress = (timer.duration - timer.secondsLeft) / timer.duration;
  const done = timer.secondsLeft === 0;

  return (
    <div className="timerOverlay" role="dialog" aria-label="Focus timer">
      <div className="timerConsole">
        <button className="linkBtn" onClick={() => setOpen(false)}>
          Back to plan
        </button>
        <div className="timerLabel">{timer.label}</div>

        <div className="timerRing">
          <svg viewBox="0 0 200 200" width="240" height="240" aria-hidden="true">
            <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--line)" strokeWidth="12" />
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={timer.color || "var(--ink)"}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              transform="rotate(-90 100 100)"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="timerClock" role="timer" aria-live="off">
            {formatClock(timer.secondsLeft)}
          </div>
        </div>

        {done ? (
          <>
            <p className="muted">Time is up.{timer.itemId ? " Log how it went." : ""}</p>
            <div className="btnRow center">
              {timer.itemId && (
                <button
                  className="btn primary"
                  onClick={() => {
                    onLogSession(timer);
                    stop();
                  }}
                >
                  Log this session
                </button>
              )}
              <button className="btn" onClick={stop}>
                Dismiss
              </button>
            </div>
          </>
        ) : (
          <div className="btnRow center">
            <button className="btn primary" onClick={toggle}>
              {timer.running ? "Pause" : "Resume"}
            </button>
            <button className="btn" onClick={() => adjust(-5)}>
              −5 min
            </button>
            <button className="btn" onClick={() => adjust(5)}>
              +5 min
            </button>
            <button className="btn" onClick={reset}>
              Restart
            </button>
            <button className="btn" onClick={stop}>
              Stop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TimerPanel({ api, defaultMinutes }) {
  const { timer, open, setOpen, begin } = api;
  const [choice, setChoice] = useState(defaultMinutes || 40);
  const [custom, setCustom] = useState("");

  const minutes = custom ? Number(custom) : choice;

  function askNotifications() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().catch(() => {});
  }

  return (
    <section className="panel">
      <h2>Timer</h2>
      {!timer ? (
        <>
          <p className="muted">Any length you like. Runs even if you switch tabs.</p>
          <div className="chipRow">
            {PRESETS.map((m) => (
              <button
                key={m}
                className={`chipBtn ${!custom && choice === m ? "on" : ""}`}
                onClick={() => {
                  setChoice(m);
                  setCustom("");
                }}
              >
                {m} min
              </button>
            ))}
            <input
              className="chipInput"
              type="number"
              min="1"
              placeholder="Custom"
              aria-label="Custom minutes"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>
          <div className="btnRow">
            <button className="btn primary" onClick={() => begin(minutes, { label: "Focus session" })}>
              Start {minutes || 40} min
            </button>
            <button className="btn" onClick={() => begin(5, { label: "Short break" })}>
              5 min break
            </button>
            <button className="btn" onClick={() => begin(15, { label: "Long break" })}>
              15 min break
            </button>
          </div>
          <button className="linkBtn" onClick={askNotifications}>
            Allow a browser alert when the timer ends
          </button>
        </>
      ) : (
        <div className="timerMini">
          <div>
            <div className="timerMiniClock">{formatClockSafe(timer)}</div>
            <div className="muted">
              {timer.label} · {timer.running ? "running" : timer.secondsLeft === 0 ? "finished" : "paused"}
            </div>
          </div>
          {!open && (
            <button className="btn primary" onClick={() => setOpen(true)}>
              Open timer
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function formatClockSafe(timer) {
  return formatClock(timer.secondsLeft);
}
