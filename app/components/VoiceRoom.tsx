"use client";

/**
 * VoiceRoom
 * ─────────
 * Display + Supabase-layer component. Agora state is lifted to DiscordLayout
 * so that the UserBar mute/deafen controls stay in sync.
 *
 * Internally it owns:
 *   • useSupabaseRealtime → live participant list (DB-backed)
 *   • useSupabasePresence → speaking status (ephemeral, no DB writes)
 *
 * Agora state (isMuted, isDeafened, localVolume, remoteVolumes, remoteUsers)
 * is passed in as props from the parent that calls useAgoraVoice.
 */

import { useEffect } from "react";
import type { IAgoraRTCRemoteUser } from "agora-rtc-sdk-ng";
import { useSupabaseRealtime } from "@/app/hooks/supabase/useSupabaseRealtime";
import { useSupabasePresence } from "@/app/hooks/supabase/useSupabasePresence";

// ─── Sub-components ──────────────────────────────────────────────────────────

function AudioLevelIndicator({
	level,
	isSpeaking,
}: {
	level: number;
	isSpeaking: boolean;
}) {
	const BARS = 5;
	const activeBars = Math.ceil(level * BARS);
	return (
		<div className="flex gap-1 items-end h-6">
			{Array.from({ length: BARS }).map((_, i) => (
				<div
					key={i}
					className={`w-1 transition-all duration-75 rounded-sm ${
						i < activeBars
							? isSpeaking
								? "bg-green-500"
								: "bg-gray-500"
							: "bg-gray-700"
					}`}
					style={{ height: `${((i + 1) / BARS) * 100}%` }}
				/>
			))}
		</div>
	);
}

function ParticipantCard({
	username,
	isLocal,
	isSpeaking,
	isMuted,
	isDeafened,
	volumeLevel,
}: {
	username: string;
	isLocal: boolean;
	isSpeaking: boolean;
	isMuted?: boolean;
	isDeafened?: boolean;
	volumeLevel: number;
}) {
	return (
		<div
			className={`bg-gray-800 rounded-xl p-4 border-2 transition-all ${
				isLocal
					? "border-indigo-500/30 hover:border-indigo-500/50"
					: "border-gray-700 hover:border-gray-600"
			}`}
		>
			<div className="flex items-center gap-4">
				{/* Avatar */}
				<div className="relative flex-shrink-0">
					<div
						className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
							isSpeaking && !isMuted
								? "bg-green-500 ring-4 ring-green-400 shadow-lg shadow-green-500/50 scale-105"
								: "bg-gray-600"
						}`}
					>
						{username.charAt(0).toUpperCase()}
					</div>

					{/* Status icons */}
					<div className="absolute -bottom-1 -right-1 flex gap-0.5">
						{isMuted && (
							<div className="bg-red-500 rounded-full p-1" title="Muted">
								<svg
									className="w-3 h-3 text-white"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path
										fillRule="evenodd"
										d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
										clipRule="evenodd"
									/>
								</svg>
							</div>
						)}
						{isDeafened && (
							<div className="bg-gray-900 rounded-full p-1" title="Deafened">
								<svg
									className="w-3 h-3 text-white"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" />
								</svg>
							</div>
						)}
					</div>
				</div>

				{/* User info */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<span className="font-semibold text-white truncate">
							{username}
						</span>
						{isLocal && (
							<span className="text-xs px-2 py-0.5 bg-indigo-500 text-white rounded-full font-medium flex-shrink-0">
								YOU
							</span>
						)}
					</div>
					<AudioLevelIndicator
						level={isMuted ? 0 : volumeLevel}
						isSpeaking={isSpeaking && !isMuted}
					/>
				</div>
			</div>
		</div>
	);
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VoiceRoomProps {
	roomId: string;
	roomName: string;
	userId: string;
	username: string;
	// Agora state — managed by parent via useAgoraVoice
	isJoined: boolean;
	isMuted: boolean;
	isDeafened: boolean;
	localVolume: number;
	remoteVolumes: Map<string | number, number>;
	remoteUsers: IAgoraRTCRemoteUser[];
	agoraError: string | null;
	onToggleMute: () => void;
	onToggleDeafen: () => void;
	onLeave: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VoiceRoom({
	roomId,
	roomName,
	userId,
	username,
	isJoined,
	isMuted,
	isDeafened,
	localVolume,
	remoteVolumes,
	agoraError,
	onToggleMute,
	onToggleDeafen,
	onLeave,
}: VoiceRoomProps) {
	const { participants, joinParticipants, leaveParticipants } =
		useSupabaseRealtime(roomId);

	const { speakingStates, broadcastVolume } = useSupabasePresence(
		roomId,
		userId,
		username,
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

	// Used to show approximate volume on remote participant cards
	const remoteVolumeValues = Array.from(remoteVolumes.values());
	const avgRemoteVol =
		remoteVolumeValues.length > 0
			? remoteVolumeValues.reduce((a, b) => a + b, 0) /
				remoteVolumeValues.length
			: 0;

	return (
		<div className="max-w-4xl mx-auto">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3 mb-6">
				<h3 className="text-xl font-semibold text-white">
					{roomName} — {participants.length} participant
					{participants.length !== 1 && "s"}
				</h3>
				<div className="flex gap-2">
					<button
						onClick={onToggleMute}
						className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
							isMuted
								? "bg-red-600 hover:bg-red-700"
								: "bg-gray-600 hover:bg-gray-500"
						} text-white`}
					>
						{isMuted ? "🔇 Unmute" : "🎤 Mute"}
					</button>
					<button
						onClick={onToggleDeafen}
						className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
							isDeafened
								? "bg-red-600 hover:bg-red-700"
								: "bg-gray-600 hover:bg-gray-500"
						} text-white`}
					>
						{isDeafened ? "🔇 Undeafen" : "🔊 Deafen"}
					</button>
					<button
						onClick={onLeave}
						className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-sm text-white transition"
					>
						Disconnect
					</button>
				</div>
			</div>

			{!isJoined && (
				<div className="flex items-center gap-3 mb-4 text-gray-400">
					<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400" />
					<span className="text-sm">Connecting to voice channel…</span>
				</div>
			)}

			{agoraError && (
				<div className="mb-4 px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
					{agoraError}
				</div>
			)}

			{/* Participant grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{/* Local user */}
				<ParticipantCard
					username={username}
					isLocal
					isMuted={isMuted}
					isDeafened={isDeafened}
					isSpeaking={speakingStates.get(userId) ?? localVolume > 0.1}
					volumeLevel={localVolume}
				/>

				{/* Remote participants (authoritative from Supabase participants table) */}
				{participants
					.filter((p) => p.user_id !== userId)
					.map((participant) => {
						const isSpeaking = speakingStates.get(participant.user_id) ?? false;
						return (
							<ParticipantCard
								key={participant.user_id}
								username={participant.username}
								isLocal={false}
								isSpeaking={isSpeaking}
								// TODO: Store agora_uid in participants table for per-user
								// volume lookups. For now show average remote volume.
								volumeLevel={isSpeaking ? avgRemoteVol : 0}
							/>
						);
					})}
			</div>
		</div>
	);
}
