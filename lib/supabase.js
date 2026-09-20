// lib/supabase.js
//
// One shared Supabase client. No login: the app talks to Supabase with the
// public anon/publishable key, and the database only lets that key touch one
// row (see supabase.sql). If the env vars are missing the app simply runs
// browser-only (localStorage), exactly like before.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's dashboard calls this the "anon" key on older projects and the
// "publishable" key on newer ones. Either name works here.
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseEnabled = Boolean(url && key);
export const supabase = supabaseEnabled
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
