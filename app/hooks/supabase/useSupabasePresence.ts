"use client";

/**
 * useSupabasePresence
 * ────────────────────
 * Tracks the "speaking" state of every user in a room using
 * Supabase Realtime Presence — no database writes needed.
 *
 * Flow:
 *   1. On mount (or when roomId changes), join a Presence channel.
 *   2. Whenever `localVolume` changes, broadcast the speaking state.
 *   3. When any user's Presence payload changes, update `speakingStates`.
 *
 * Usage:
 *   const { speakingStates, broadcastVolume } = useSupabasePresence(
 *     roomId, userId, username, vadThreshold
 *   );
 *   // speakingStates: Map<userId, boolean>
 *
 *   // Call this from your volume-indicator callback:
 *   broadcastVolume(localVolume);  // 0–1 normalised
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface PresencePayload {
	userId: string;
	username: string;
	isSpeaking: boolean;
}

export interface UseSupabasePresenceReturn {
	speakingStates: Map<string, boolean>; // userId → isSpeaking
	broadcastVolume: (normalisedLevel: number) => void;
}

export function useSupabasePresence(
	roomId: string | null,
	userId: string,
	username: string,
	/** Threshold from AudioSettings (0–1). Defaults to 0.1 (10%). */
	vadThreshold: number = 0.1,
): UseSupabasePresenceReturn {
	const [speakingStates, setSpeakingStates] = useState<Map<string, boolean>>(
		new Map(),
	);
	const channelRef = useRef<RealtimeChannel | null>(null);

	// Keep a ref so broadcastVolume always uses the latest threshold
	// without needing to be recreated in useCallback.
	const vadThresholdRef = useRef(vadThreshold);
	useEffect(() => {
		vadThresholdRef.current = vadThreshold;
	}, [vadThreshold]);

	// ── Presence channel lifecycle ─────────────────────────────────────────────
	useEffect(() => {
		if (!roomId || !userId) return;

		const channel = supabase.channel(`presence:room:${roomId}`, {
			config: { presence: { key: userId } },
		});

		channel
			.on("presence", { event: "sync" }, () => {
				const state = channel.presenceState<PresencePayload>();
				const nextMap = new Map<string, boolean>();

				Object.entries(state).forEach(([, presences]) => {
					// Each key may have multiple presences (multiple tabs); take the first.
					const p = presences[0] as PresencePayload & { userId?: string };
					if (p?.userId) {
						nextMap.set(p.userId, p.isSpeaking ?? false);
					}
				});

				setSpeakingStates(nextMap);
			})
			.on("presence", { event: "leave" }, ({ key }) => {
				setSpeakingStates((prev) => {
					const next = new Map(prev);
					next.delete(key);
					return next;
				});
			})
			.subscribe(async (status) => {
				if (status === "SUBSCRIBED") {
					// Announce ourselves immediately.
					await channel.track({
						userId,
						username,
						isSpeaking: false,
					} satisfies PresencePayload);
				}
			});

		channelRef.current = channel;

		return () => {
			channel.untrack();
			supabase.removeChannel(channel);
			channelRef.current = null;
		};
	}, [roomId, userId, username]);

	// ── Broadcast speaking state ───────────────────────────────────────────────
	// FIXED: Uses vadThresholdRef so the latest threshold is always applied
	// without having to recreate this callback whenever the prop changes.
	const broadcastVolume = useCallback(
		(normalisedLevel: number) => {
			const channel = channelRef.current;
			if (!channel) return;

			const isSpeaking = normalisedLevel > vadThresholdRef.current;

			// Re-track with updated speaking flag (Presence merges by key).
			channel.track({
				userId,
				username,
				isSpeaking,
			} satisfies PresencePayload);
		},
		[userId, username],
	);

	return { speakingStates, broadcastVolume };
}
