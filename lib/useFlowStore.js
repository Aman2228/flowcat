"use client";

// lib/useFlowStore.js
//
// All of Sana's data lives in this browser (localStorage) — no account, no
// database, nothing to set up. Use Settings → Backup to move it to another
// device or keep a copy.

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEY, makeDefaultState } from "./data";

const isArr = (v) => (Array.isArray(v) ? v : []);

// Merge whatever was saved (or imported) over the defaults so a missing or
// older field never crashes the app.
export function normalizeState(raw) {
  const base = makeDefaultState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    settings: { ...base.settings, ...(raw.settings || {}) },
    categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : base.categories,
    events: Array.isArray(raw.events) ? raw.events : base.events,
    patterns: { ...base.patterns, ...(raw.patterns || {}) },
    plans: raw.plans && typeof raw.plans === "object" ? raw.plans : {},
    tasks: isArr(raw.tasks),
    milestones: isArr(raw.milestones),
    mocks: isArr(raw.mocks),
    disruptions: isArr(raw.disruptions),
  };
}

export function useFlowStore() {
  const [state, setState] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) {
      console.error("Could not read saved planner data:", e);
    }
    setState(normalizeState(saved));
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!state || !loaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveError(false);
    } catch (e) {
      console.error("Could not save planner data:", e);
      setSaveError(true);
    }
  }, [state]);

  const update = useCallback((fn) => setState((prev) => (prev ? fn(prev) : prev)), []);
  const replace = useCallback((next) => setState(normalizeState(next)), []);
  const reset = useCallback(() => setState(makeDefaultState()), []);

  return { state, update, replace, reset, saveError };
}
