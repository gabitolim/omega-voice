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

		// 1. Fetch current participants.
		//    Wrapping in an async IIFE lets us set isLoading = true before the
		//    await without calling setState synchronously in the effect body.
		(async () => {
			setIsLoading(true);
			const { data, error: fetchError } = await supabase
				.from("participants")
				.select("*")
				.eq("room_id", roomId);
			setIsLoading(false);
			if (fetchError) {
				setError(fetchError.message);
				return;
			}
			setError(null);

			const rows = (data as Participant[]) ?? [];

			// Enrich with avatar_url from profiles (participants table doesn't store it)
			if (rows.length > 0) {
				const ids = rows.map((r) => r.user_id);
				const { data: profiles } = await supabase
					.from("profiles")
					.select("id, avatar_url")
					.in("id", ids);
				if (profiles) {
					const avatarMap = new Map(
						(profiles as { id: string; avatar_url: string | null }[]).map(
							(p) => [p.id, p.avatar_url],
						),
					);
					setParticipants(
						rows.map((r) => ({ ...r, avatar_url: avatarMap.get(r.user_id) ?? null })),
					);
					return;
				}
			}

			setParticipants(rows);
		})();

		// 2. Subscribe to all changes on participants, filter client-side.
		// Server-side filters on postgres_changes are unreliable with UUID PKs
		// unless the table is in the realtime publication AND replica identity is set.
		const channel = supabase
			.channel(`participants-room-${roomId}`)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "participants",
				},
				async (payload) => {
					const p = payload.new as Participant;
					if (p.room_id !== roomId) return;
					// Fetch avatar_url from profiles for the new participant
					const { data: prof } = await supabase
						.from("profiles")
						.select("avatar_url")
						.eq("id", p.user_id)
						.single();
					const enriched = { ...p, avatar_url: prof?.avatar_url ?? null };
					setParticipants((prev) =>
						prev.find((x) => x.user_id === enriched.user_id) ? prev : [...prev, enriched],
					);
				},
			)
			.on(
				"postgres_changes",
				{
					event: "UPDATE",
					schema: "public",
					table: "participants",
				},
				(payload) => {
					const p = payload.new as Participant;
					if (p.room_id !== roomId) return;
					setParticipants((prev) =>
						prev.map((x) => (x.user_id === p.user_id ? p : x)),
					);
				},
			)
			.on(
				"postgres_changes",
				{
					event: "DELETE",
					schema: "public",
					table: "participants",
				},
				(payload) => {
					const old = payload.old as Partial<Participant>;
					if (old.room_id && old.room_id !== roomId) return;
					if (old.user_id) {
						setParticipants((prev) =>
							prev.filter((x) => x.user_id !== old.user_id),
						);
					} else {
						// Replica identity not full yet — refetch
						supabase
							.from("participants")
							.select("*")
							.eq("room_id", roomId)
							.then(({ data }) => {
								if (data) setParticipants(data as Participant[]);
							});
					}
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
