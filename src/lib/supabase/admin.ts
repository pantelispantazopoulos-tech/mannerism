import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Server-only — uses the Supabase *service role* key, which bypasses RLS
// entirely. Never import this from a "use client" component or any file
// that could end up in the browser bundle. Only the Stripe route handlers
// (src/app/api/stripe/*) use this, to write subscription state that RLS
// deliberately blocks the browser from writing directly (see
// supabase/schema.sql — `public.users` has a SELECT-only policy for
// clients; every write goes through here or the auth trigger).
//
// Built lazily, same reasoning as src/lib/stripe/server.ts — a deploy
// before this env var is set shouldn't fail the whole build.
let cachedClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and fill in your Supabase project's service role key (Settings -> API -> service_role)."
    );
  }
  cachedClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
