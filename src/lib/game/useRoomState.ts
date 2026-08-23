"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getPlayers, getRoomByCode, getRoundSecure } from "./roomApi";
import type { Player, Room, RoundSecure } from "@/lib/supabase/types";

interface RoomState {
  room: Room | null;
  players: Player[];
  round: RoundSecure | null;
  myPlayer: Player | null;
  loading: boolean;
  error: string | null;
}

// Central realtime hook for a room. `rooms` and `players` are subscribed to
// directly via Postgres Changes. `rounds` is intentionally NOT subscribed
// to (see supabase/schema.sql, rounds_secure) — instead, whenever the
// room's `current_round_id` or `status` changes we re-fetch the masked
// `rounds_secure` view over plain REST, which re-applies the "hide the
// pattern from the Guesser" rule on every read.
export function useRoomState(code: string | null, userId: string | null) {
  const [state, setState] = useState<RoomState>({
    room: null,
    players: [],
    round: null,
    myPlayer: null,
    loading: true,
    error: null,
  });

  // Track the round id we've already fetched so we don't refetch on every
  // unrelated `rooms` update (e.g. round_started_at ticking isn't a thing,
  // but defensive anyway).
  const lastRoundIdRef = useRef<string | null>(null);

  // Mirrors state.room so the players-change handler below (whose effect
  // only re-subscribes when the room *id* changes) can always read the
  // current_round_id as of the latest render, not whatever it was when the
  // channel was created.
  const roomRef = useRef<Room | null>(null);
  useEffect(() => {
    roomRef.current = state.room;
  }, [state.room]);

  const refreshRound = useCallback(async (roundId: string | null) => {
    if (!roundId) {
      lastRoundIdRef.current = null;
      setState((s) => ({ ...s, round: null }));
      return;
    }
    const round = await getRoundSecure(roundId);
    lastRoundIdRef.current = roundId;
    setState((s) => ({ ...s, round }));
  }, []);

  const refreshPlayers = useCallback(async (roomId: string) => {
    const players = await getPlayers(roomId);
    setState((s) => ({
      ...s,
      players,
      myPlayer: players.find((p) => p.user_id === userId) ?? null,
    }));
  }, [userId]);

  useEffect(() => {
    if (!code || !userId) return;
    let cancelled = false;

    async function load() {
      try {
        const room = await getRoomByCode(code!);
        if (!room) {
          if (!cancelled) setState((s) => ({ ...s, loading: false, error: "Room not found" }));
          return;
        }
        const players = await getPlayers(room.id);
        const round = room.current_round_id ? await getRoundSecure(room.current_round_id) : null;
        lastRoundIdRef.current = room.current_round_id;

        if (cancelled) return;
        setState({
          room,
          players,
          round,
          myPlayer: players.find((p) => p.user_id === userId) ?? null,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to load room",
          }));
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [code, userId]);

  useEffect(() => {
    const roomId = state.room?.id;
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const newRoom = payload.new as Room;
          setState((s) => ({ ...s, room: newRoom }));
          // Always refetch: grading a round and submitting a guess both
          // change round content (guess_text/guess_correct) without
          // necessarily changing current_round_id, and `rounds` itself
          // isn't broadcast over realtime (see rounds_secure in schema.sql).
          refreshRound(newRoom.current_round_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
        () => {
          refreshPlayers(roomId);
          // A player joining mid-round (e.g. via a shared link) is the one
          // case where `rooms` doesn't change but this device's view of the
          // round does: `rounds_secure` only returns a row once the caller
          // is a member, so their very first fetch (before they'd joined)
          // came back empty and nothing since has told them to try again.
          refreshRound(roomRef.current?.current_round_id ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.room?.id, refreshRound, refreshPlayers]);

  const refresh = useCallback(async () => {
    if (!state.room) return;
    await refreshPlayers(state.room.id);
    await refreshRound(state.room.current_round_id);
  }, [state.room, refreshPlayers, refreshRound]);

  return { ...state, refresh };
}
