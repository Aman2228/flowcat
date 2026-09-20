"use client";

// lib/useFlowStore.js
//
// The whole planner state lives in React and is cached in localStorage
// (instant load, works offline). When Supabase is configured the same state is
// also saved to ONE shared row and pulled back on every device: when the app
// opens, when the tab comes back into focus, and live through Realtime.
// There is no login: whoever opens the app sees and edits the same plan.
//
// Without the Supabase env vars this behaves exactly like before.
//
// Conflict rule: last write wins. Fine for one person on one device at a time
// (the app pulls on focus, so a device you just switched to is up to date).
// A device that has never reached the server refuses to upload, so a fresh
// phone that opens offline can't overwrite your real plan with an empty one.

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEY, makeDefaultState } from "./data";
import { supabase, supabaseEnabled } from "./supabase";
import { uid } from "./time";

const META_KEY = "flow_cat_sync_meta_v1"; // { syncedAt, dirty } for this device
const DEVICE_KEY = "flow_cat_device_id";
const BACKUP_KEY = "flow_cat_backup_before_sync"; // local copy kept if the server copy replaces it
const TABLE = "flow_planner_state";
const ROW_ID = "main"; // the one shared row; the database refuses any other id
const PUSH_DELAY = 800; // ms to wait after the last edit before saving to the server
const FETCH_TIMEOUT = 6000; // ms before we give up and run from the device copy

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

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(`Could not read ${key}:`, e);
    return null;
  }
}

function writeJSON(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value)); // may throw when storage is full
}

function getDeviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid("dev");
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return uid("dev");
  }
}

// True when there is nothing worth keeping (never edited, still the defaults).
function isPristine(raw) {
  return !raw || JSON.stringify(normalizeState(raw)) === JSON.stringify(makeDefaultState());
}

async function fetchRow() {
  const request = supabase.from(TABLE).select("data, updated_at, device_id").eq("id", ROW_ID).maybeSingle();
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: new Error("timeout") }), FETCH_TIMEOUT));
  const { data, error } = await Promise.race([request, timeout]);
  return { row: data ?? null, error: error || null };
}

export function useFlowStore() {
  const [state, setState] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [syncStatus, setSyncStatus] = useState(supabaseEnabled ? "idle" : "local"); // local | idle | syncing | synced | offline

  const ready = useRef(false); // first load finished, edits may now be saved
  const skipPush = useRef(false); // the next state change came from the server, don't echo it back
  const latest = useRef(null); // newest state, for the debounced save
  const changeSeq = useRef(0); // bumps on every local edit
  const pushTimer = useRef(null);
  const syncedAt = useRef(null); // updated_at of the server row this device last saw
  const dirty = useRef(false); // local edits not yet on the server
  const serverChecked = useRef(false); // this device has a real baseline from the server
  const loadToken = useRef(0); // lets a newer load cancel an older one
  const deviceId = useRef("");

  const saveMeta = useCallback(() => {
    try {
      writeJSON(META_KEY, { syncedAt: syncedAt.current, dirty: dirty.current });
    } catch {
      /* the state cache is what matters; meta is best effort */
    }
  }, []);

  // -- Server save (debounced) -------------------------------------------------

  const flush = useCallback(async () => {
    clearTimeout(pushTimer.current);
    const data = latest.current;
    if (!supabaseEnabled || !data || !dirty.current) return;
    if (!serverChecked.current) return setSyncStatus("offline"); // never reached the server yet: don't overwrite it

    const seq = changeSeq.current;
    setSyncStatus("syncing");
    const { data: row, error } = await supabase
      .from(TABLE)
      .upsert({ id: ROW_ID, data, device_id: deviceId.current }, { onConflict: "id" })
      .select("updated_at")
      .single();

    if (error) {
      console.error("Could not sync:", error.message);
      setSyncStatus("offline"); // stays dirty; retried on the next edit, focus or reconnect
      return;
    }
    syncedAt.current = row.updated_at;
    if (seq === changeSeq.current) {
      dirty.current = false;
      setSyncStatus("synced");
    }
    saveMeta();
  }, [saveMeta]);

  const schedulePush = useCallback(() => {
    clearTimeout(pushTimer.current);
    setSyncStatus("syncing");
    pushTimer.current = setTimeout(flush, PUSH_DELAY);
  }, [flush]);

  // -- Load: decide whether this device or the server is the truth --------------

  const loadFromServer = useCallback(async () => {
    const token = ++loadToken.current;
    setSyncStatus("syncing");
    const meta = readJSON(META_KEY) || {};
    const { row, error } = await fetchRow();
    if (token !== loadToken.current) return; // a newer load took over

    const local = latest.current ?? readJSON(STORAGE_KEY);
    let next = normalizeState(local);
    let pushNeeded = false;

    if (error) {
      // Offline or slow: run from this device's copy and sync later.
      dirty.current = dirty.current || !!meta.dirty;
      syncedAt.current = meta.syncedAt ?? syncedAt.current;
      serverChecked.current = Boolean(syncedAt.current); // a device that never synced must not upload yet
      pushNeeded = dirty.current;
      setSyncStatus("offline");
    } else if (!row) {
      // Nothing on the server yet: upload whatever this device already has.
      serverChecked.current = true;
      dirty.current = false;
      syncedAt.current = null;
      pushNeeded = true;
    } else if (meta.dirty && meta.syncedAt && meta.syncedAt === row.updated_at) {
      // Unsynced edits made here and nobody else touched the server copy: keep ours.
      serverChecked.current = true;
      dirty.current = false;
      syncedAt.current = row.updated_at;
      pushNeeded = true;
    } else {
      // The server copy wins. Keep the old local copy as a backup if it holds anything worth keeping.
      if (!isPristine(local) && (meta.dirty || !meta.syncedAt)) {
        try {
          writeJSON(BACKUP_KEY, local);
        } catch {
          /* storage full: nothing more we can do */
        }
      }
      next = normalizeState(row.data);
      serverChecked.current = true;
      dirty.current = false;
      syncedAt.current = row.updated_at;
      setSyncStatus("synced");
    }

    skipPush.current = !pushNeeded;
    ready.current = true;
    saveMeta();
    setState(next);
  }, [saveMeta]);

  // -- Later pulls (focus, reconnect, live change) ---------------------------------

  const pull = useCallback(async () => {
    if (!supabaseEnabled || !ready.current) return;
    if (!serverChecked.current) return loadFromServer(); // first contact still pending
    if (dirty.current) return flush(); // send our edits first

    const { row, error } = await fetchRow();
    if (error) return setSyncStatus("offline");
    if (!row || row.updated_at === syncedAt.current || dirty.current) return;

    skipPush.current = true;
    syncedAt.current = row.updated_at;
    saveMeta();
    setState(normalizeState(row.data));
    setSyncStatus("synced");
  }, [flush, loadFromServer, saveMeta]);

  // -- First load ----------------------------------------------------------------------

  useEffect(() => {
    deviceId.current = getDeviceId();
    if (!supabaseEnabled) {
      setState(normalizeState(readJSON(STORAGE_KEY)));
      ready.current = true;
      return;
    }
    loadFromServer();
    return () => {
      loadToken.current += 1;
    };
  }, [loadFromServer]);

  // -- Every edit: cache locally, then queue a server save ---------------------

  useEffect(() => {
    if (!state || !ready.current) return;
    latest.current = state;

    try {
      writeJSON(STORAGE_KEY, state);
      setSaveError(false);
    } catch (e) {
      console.error("Could not save planner data:", e);
      setSaveError(true);
    }

    if (!supabaseEnabled) return;
    if (skipPush.current) {
      skipPush.current = false;
      return;
    }
    changeSeq.current += 1;
    dirty.current = true;
    saveMeta();
    schedulePush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // -- Keep devices in step: focus, reconnect, live changes ----------------------

  useEffect(() => {
    if (!supabaseEnabled) return;

    const onVisibility = () => (document.visibilityState === "visible" ? pull() : flush());
    const onOnline = () => pull();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", flush);

    const channel = supabase
      .channel("flow-planner-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `id=eq.${ROW_ID}` },
        (payload) => {
          if (payload.new?.device_id !== deviceId.current) pull();
        }
      )
      .subscribe();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", flush);
      supabase.removeChannel(channel);
    };
  }, [pull, flush]);

  // -- Public API -----------------------------------------------------------------

  const update = useCallback((fn) => setState((prev) => (prev ? fn(prev) : prev)), []);
  const replace = useCallback((next) => setState(normalizeState(next)), []);
  const reset = useCallback(() => setState(makeDefaultState()), []);

  return {
    state,
    update,
    replace,
    reset,
    saveError,
    sync: { enabled: supabaseEnabled, status: syncStatus },
  };
}
