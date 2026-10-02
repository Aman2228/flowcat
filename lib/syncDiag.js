// lib/syncDiag.js
//
// Turns Supabase / network failures into plain-English reasons, and runs a
// step-by-step connection test, so "Offline" is never a mystery.

import { supabase, supabaseEnabled, supabaseUrl, supabaseKey } from "./supabase";

export const TABLE = "flow_planner_state";
export const ROW_ID = "main";

// error -> { code, message, hint }
export function describeError(err) {
  if (!err) return null;
  const message = String(err.message || err.error_description || err).trim();
  const code = String(err.code || err.status || "").trim();
  const low = message.toLowerCase();
  let hint = "";

  if (code === "TIMEOUT" || low === "timeout") {
    hint =
      "Supabase did not answer in time. Free projects pause after about a week of no use: open the Supabase dashboard and click Restore project. Otherwise it is just a weak network, so try again.";
  } else if (low.includes("failed to fetch") || low.includes("networkerror") || low.includes("load failed")) {
    hint =
      "The browser could not reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL is exactly the Project URL (https://xxxx.supabase.co, with no /rest/v1 and no trailing slash). If you just changed env vars on Vercel, you must redeploy. A paused project also looks like this.";
  } else if (code === "PGRST205" || code === "42P01" || low.includes("could not find the table") || low.includes("does not exist")) {
    hint = `The table ${TABLE} does not exist in this project. Run the supabase.sql from this folder in Supabase: SQL Editor, New query, paste, Run. Make sure it finishes with "Success".`;
  } else if (code === "42501" || low.includes("permission denied")) {
    hint =
      "The table exists but the public key has no permission on it. Re-run the updated supabase.sql, it now includes the GRANT lines that new Supabase projects need.";
  } else if (low.includes("row-level security") || low.includes("rls")) {
    hint = "Row-level security is blocking the app. Re-run the updated supabase.sql so the three policies exist.";
  } else if (code === "401" || code === "403" || low.includes("invalid api key") || low.includes("jwt") || low.includes("apikey")) {
    hint =
      "Supabase rejected the key. Use the anon / publishable key (Project Settings, API) from the SAME project as the URL, pasted with no quotes or spaces. Never the secret / service_role key.";
  } else if (code === "PGRST116") {
    hint = "More than one row came back, which should be impossible. Re-run supabase.sql.";
  }

  return { code, message, hint };
}

function jwtRole(key) {
  try {
    const part = key.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return json.role || null;
  } catch {
    return null;
  }
}

// Returns [{ id, label, ok, detail }] ; stops at the first hard failure.
export async function runConnectionTest(deviceId) {
  const out = [];
  const push = (id, label, ok, detail = "") => out.push({ id, label, ok, detail });

  // 1. env
  if (!supabaseEnabled) {
    push(
      "env",
      "Keys found in this build",
      false,
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing. Add both (locally in .env.local, on Vercel in Settings, Environment Variables) and redeploy. They are baked in at build time."
    );
    return out;
  }
  let host = supabaseUrl;
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    push("env", "URL looks valid", false, `"${supabaseUrl}" is not a valid URL. It should look like https://xxxx.supabase.co`);
    return out;
  }
  if (/\/rest\/|\/$/.test(supabaseUrl.replace(/^https?:\/\//, ""))) {
    push("env", "URL looks valid", false, "Remove the trailing slash or any path: use only https://xxxx.supabase.co");
    return out;
  }
  const role = jwtRole(supabaseKey);
  if (role === "service_role" || supabaseKey.startsWith("sb_secret_")) {
    push("env", "Key is the public one", false, "That is the SECRET key. Use the anon / publishable key instead, and rotate the secret one since it is now exposed.");
    return out;
  }
  push("env", "Keys found in this build", true, `Project ${host}`);

  // 2. read
  const t0 = Date.now();
  const read = await Promise.race([
    supabase.from(TABLE).select("id, updated_at").eq("id", ROW_ID).maybeSingle(),
    new Promise((resolve) => setTimeout(() => resolve({ error: { code: "TIMEOUT", message: "timeout" } }), 12000)),
  ]).catch((e) => ({ error: e }));
  if (read.error) {
    const d = describeError(read.error);
    push("read", "Can read the table", false, `${d.message}${d.code ? ` (${d.code})` : ""}. ${d.hint}`);
    return out;
  }
  push("read", "Can read the table", true, `${Date.now() - t0} ms`);

  if (!read.data) {
    push("row", "Saved plan on the server", true, "None yet. Your first edit (or Force upload) creates it.");
    return out;
  }
  push("row", "Saved plan on the server", true, `Last saved ${new Date(read.data.updated_at).toLocaleString()}`);

  // 3. write: touches only device_id/updated_at, the plan itself is left alone
  const write = await supabase.from(TABLE).update({ device_id: deviceId }).eq("id", ROW_ID).select("updated_at");
  if (write.error) {
    const d = describeError(write.error);
    push("write", "Can write to the table", false, `${d.message}${d.code ? ` (${d.code})` : ""}. ${d.hint}`);
    return out;
  }
  if (!write.data || write.data.length === 0) {
    push("write", "Can write to the table", false, "The update matched nothing, which means the update policy is missing. Re-run the updated supabase.sql.");
    return out;
  }
  push("write", "Can write to the table", true);
  return out;
}
