"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./client";
import type { AppUser } from "./types";

interface AccountState {
  loading: boolean;
  email: string | null;
  appUser: AppUser | null;
  isSubscribed: boolean;
}

// A player is always signed in anonymously the moment the app loads (see
// useAnonymousAuth) — that's enough to host/join rooms and add free,
// session-only custom patterns. Saving/publishing patterns and
// subscribing all need a *real*, reachable identity, which this hook adds
// on top of the same session rather than replacing it.
//
// `linkEmail` calls `supabase.auth.updateUser({ email })` — Supabase's
// documented way to upgrade an anonymous session to a permanent one. The
// user clicks a confirmation link emailed to them; once confirmed,
// auth.uid() is UNCHANGED (their room history, scores, everything stays
// attached to the same id) but auth.users.email is now set, which the
// `on_auth_user_upsert` trigger in supabase/schema.sql turns into a
// `public.users` row — that's what subscription_status lives on.
export function useAccount(userId: string | null) {
  const [state, setState] = useState<AccountState>({
    loading: true,
    email: null,
    appUser: null,
    isSubscribed: false,
  });
  // Bumped by `refresh()` to force the effect below to re-run on demand
  // (e.g. after redirecting back from Checkout) without duplicating its
  // fetch logic in a second, externally-callable function.
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        if (!cancelled) setState({ loading: false, email: null, appUser: null, isSubscribed: false });
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user.email ?? null;

      const { data: appUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      const isSubscribed =
        !!appUser &&
        appUser.subscription_status === "active" &&
        !!appUser.subscribed_until &&
        new Date(appUser.subscribed_until).getTime() > Date.now();

      if (!cancelled) setState({ loading: false, email, appUser, isSubscribed });
    }

    load();
    // Re-check after the user confirms an email-link click (Supabase
    // detects the token in the URL and fires this) or after any other
    // auth state change, so subscription status can't go stale in an open
    // tab.
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [userId, refreshTick]);

  const linkEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
  }, []);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  return { ...state, linkEmail, refresh };
}
