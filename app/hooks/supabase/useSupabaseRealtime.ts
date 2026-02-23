"use client";

/**
 * useSupabaseRealtime
 * ────────────────────
 * Listens to INSERT and DELETE events on the `participants` table
 * for a specific room. Keeps a live list of who is currently in the room.
 *
 * Also exposes helpers to join / leave the room in the DB.
 *
 * Assumed `participants` schema:
 *   id         uuid  (primary key, default gen_random_uuid())
 *   room_id    text  (references rooms.id)
 *   user_id    uuid  (references profiles.id  —or— a localStorage UUID)
 *   username   text
 *   joined_at  timestamptz (default now())
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, type Participant } from "@/app/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface UseSupabaseRealtimeReturn {
	participants: Participant[];
	joinParticipants: (
		roomId: string,
		userId: string,
		username: string,
	) => Promise<void>;
	leaveParticipants: (roomId: string, userId: string) => Promise<void>;
	isLoading: boolean;
	error: string | null;
}

export function useSupabaseRealtime(
	roomId: string | null,
): UseSupabaseRealtimeReturn {
	const [participants, setParticipants] = useState<Participant[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const channelRef = useRef<RealtimeChannel | null>(null);

	// ── Bootstrap + subscribe when roomId changes ──────────────────────────────
	useEffect(() => {
		// Participants and loading state are reset in the cleanup below,
		// so when roomId becomes null the state resets without any
		// synchronous setState call inside the effect body.
		if (!roomId) return;

		// 1. Fetch current participants — all state updates happen inside
		//    the async .then() callback, never in the synchronous effect body.
		supabase
			.from("participants")
			.select("*")
			.eq("room_id", roomId)
			.then(({ data, error: fetchError }) => {
				setIsLoading(false);
				if (fetchError) {
					setError(fetchError.message);
					return;
				}
				setError(null);
				setParticipants((data as Participant[]) ?? []);
			});

		// 2. Subscribe to changes on this room's rows.
		const channel = supabase
			.channel(`participants:room_id=eq.${roomId}`)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "participants",
					filter: `room_id=eq.${roomId}`,
				},
				(payload) => {
					const newParticipant = payload.new as Participant;
					setParticipants((prev) =>
						prev.find((p) => p.user_id === newParticipant.user_id)
							? prev
							: [...prev, newParticipant],
					);
				},
			)
			.on(
				"postgres_changes",
				{
					event: "DELETE",
					schema: "public",
					table: "participants",
					filter: `room_id=eq.${roomId}`,
				},
				(payload) => {
					const deleted = payload.old as Partial<Participant>;
					setParticipants((prev) =>
						prev.filter((p) => p.user_id !== deleted.user_id),
					);
				},
			)
			.subscribe((status) => {
				if (status === "CHANNEL_ERROR") {
					setError("Realtime channel error. Check your Supabase RLS policies.");
				}
			});

		channelRef.current = channel;

		return () => {
			// Reset state when leaving a room (roomId changed or unmount).
			setParticipants([]);
			setIsLoading(false);
			setError(null);
			supabase.removeChannel(channel);
			channelRef.current = null;
		};
	}, [roomId]);

	// ── Write helpers ──────────────────────────────────────────────────────────

	const joinParticipants = useCallback(
		async (rId: string, userId: string, username: string) => {
			// Upsert so re-joins (e.g. after a refresh) don't create duplicates.
			const { error: upsertError } = await supabase
				.from("participants")
				.upsert(
					{ room_id: rId, user_id: userId, username },
					{ onConflict: "room_id,user_id" },
				);

			if (upsertError) {
				console.error("[useSupabaseRealtime] joinParticipants:", upsertError);
				setError(upsertError.message);
			}
		},
		[],
	);

	const leaveParticipants = useCallback(async (rId: string, userId: string) => {
		const { error: deleteError } = await supabase
			.from("participants")
			.delete()
			.eq("room_id", rId)
			.eq("user_id", userId);

		if (deleteError) {
			console.error("[useSupabaseRealtime] leaveParticipants:", deleteError);
			setError(deleteError.message);
		}
	}, []);

	return {
		participants,
		joinParticipants,
		leaveParticipants,
		isLoading,
		error,
	};
}
