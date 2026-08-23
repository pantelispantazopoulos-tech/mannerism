"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your Supabase project values."
  );
}

// Single browser-side client, reused everywhere. Sessions (including the
// anonymous auth session set up in useAnonymousAuth) persist to
// localStorage automatically via supabase-js.
//
// The generic must be passed here (not via a `: SupabaseClient<Database>`
// annotation on the const) — supabase-js's types resolve `Database` through
// several chained conditional types, and that inference only works
// reliably when driven from the call site.
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
