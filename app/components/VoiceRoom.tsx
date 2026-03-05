"use client";

/**
 * VoiceRoom (headless)
 * ────────────────────
 * Owns the Supabase participant + presence subscriptions for a voice room.
 * Participant data is surfaced to the parent via `onParticipantsChange`
 * so the channel list can display who is in each channel (Discord-style).
 * This component renders no participant cards — those live in ChannelList.
 */

import { useEffect } from "react";
import { useSupabaseRealtime } from "@/app/hooks/supabase/useSupabaseRealtime";
import { useSupabasePresence } from "@/app/hooks/supabase/useSupabasePresence";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomParticipant = {
	user_id: string;
	username: string;
	avatar_url?: string | null;
	isSpeaking: boolean;
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VoiceRoomProps {
	roomId: string;
	userId: string;
	username: string;
	// Agora state — managed by parent via useAgoraVoice
	isJoined: boolean;
	localVolume: number;
	remoteVolumes: Map<string | number, number>;
	agoraError: string | null;
	/** Speaking sensitivity from AudioSettings (0–1). Defaults to 0.1. */
	vadThreshold?: number;
	/** Called whenever the participant list or speaking states change. */
	onParticipantsChange: (participants: RoomParticipant[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceRoom({
	roomId,
	userId,
	username,
	isJoined,
	localVolume,
	agoraError,
	vadThreshold = 0.1,
	onParticipantsChange,
}: VoiceRoomProps) {
	const { participants, joinParticipants, leaveParticipants } =
		useSupabaseRealtime(roomId);

	const { speakingStates, broadcastVolume } = useSupabasePresence(
		roomId,
		userId,
		username,
		vadThreshold,
	);

	// Register / deregister participant in DB
	useEffect(() => {
		joinParticipants(roomId, userId, username);
		return () => {
			leaveParticipants(roomId, userId);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [roomId, userId]);

	// Broadcast local volume → Presence speaking state
	useEffect(() => {
		broadcastVolume(localVolume);
	}, [localVolume, broadcastVolume]);

	// Notify parent whenever participants or speaking states change
	useEffect(() => {
		const list: RoomParticipant[] = participants.map((p) => ({
			user_id: p.user_id,
			username: p.username,
			avatar_url: p.avatar_url ?? null,
			isSpeaking: speakingStates.get(p.user_id) ?? false,
		}));
		onParticipantsChange(list);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [participants, speakingStates]);

	// Render only transient states — participant list lives in ChannelList
	if (!isJoined || agoraError) {
		return (
			<div className="flex flex-col gap-2 mb-4">
				{!isJoined && (
					<div className="flex items-center gap-3 text-gray-400">
						<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400" />
						<span className="text-sm">Connecting to voice channel…</span>
					</div>
				)}
				{agoraError && (
					<div className="px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
						{agoraError}
					</div>
				)}
			</div>
		);
	}

	return null;
}
