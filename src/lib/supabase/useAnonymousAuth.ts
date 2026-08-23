"use client";

import { useEffect, useState } from "react";
import { supabase } from "./client";

interface AuthState {
  userId: string | null;
  loading: boolean;
  error: string | null;
}

// Every device that opens the app gets signed in anonymously so it has a
// stable auth.uid() for RLS (see supabase/schema.sql), with zero signup
// friction — nobody wants to make an account to play a party game.
export function useAnonymousAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    userId: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function ensureSession() {
      const { data } = await supabase.auth.getSession();
      let userId = data.session?.user.id ?? null;

      if (!userId) {
        const { data: signInData, error } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (error) {
          setState({ userId: null, loading: false, error: error.message });
          return;
        }
        userId = signInData.user?.id ?? null;
      }

      if (!cancelled) {
        setState({ userId, loading: false, error: null });
      }
    }

    ensureSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session?.user.id) {
        setState((s) => ({ ...s, userId: session.user.id, loading: false }));
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
