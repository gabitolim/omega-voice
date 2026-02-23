"use client";

/**
 * useAgoraVoice
 * ─────────────
 * Manages the full lifecycle of an Agora RTC voice session:
 *   • Joining / leaving a channel (token fetched from Supabase edge fn)
 *   • Publishing the local microphone track
 *   • Subscribing to remote users
 *   • Mute / deafen controls
 *   • Volume-indicator events (used for speaking detection)
 *
 * Usage:
 *   const { joinChannel, leaveChannel, toggleMute, toggleDeafen,
 *           isMuted, isDeafened, isJoined,
 *           localVolume, remoteVolumes } = useAgoraVoice();
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	IAgoraRTCClient,
	IMicrophoneAudioTrack,
	IAgoraRTCRemoteUser,
} from "agora-rtc-sdk-ng";
import { getAgoraClient, AGORA_APP_ID } from "@/app/lib/agoraClient";
import { fetchAgoraToken } from "@/app/lib/supabaseClient";

export interface RemoteVolumeEntry {
	uid: string | number;
	level: number; // 0 – 100 (raw Agora value)
}

export interface UseAgoraVoiceReturn {
	joinChannel: (
		roomId: string,
		userId: string,
		audioSettings?: Partial<AudioConstraints>,
	) => Promise<void>;
	leaveChannel: () => Promise<void>;
	toggleMute: () => void;
	toggleDeafen: () => void;
	isMuted: boolean;
	isDeafened: boolean;
	isJoined: boolean;
	localVolume: number; // 0 – 1 (normalised)
	remoteVolumes: Map<string | number, number>; // uid → 0–1
	remoteUsers: IAgoraRTCRemoteUser[];
	error: string | null;
}

interface AudioConstraints {
	inputDeviceId?: string;
	inputVolume?: number;
}

export function useAgoraVoice(): UseAgoraVoiceReturn {
	const clientRef = useRef<IAgoraRTCClient | null>(null);
	const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null);

	const [isMuted, setIsMuted] = useState(false);
	const [isDeafened, setIsDeafened] = useState(false);
	const [isJoined, setIsJoined] = useState(false);
	const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
	const [localVolume, setLocalVolume] = useState(0);
	const [remoteVolumes, setRemoteVolumes] = useState<
		Map<string | number, number>
	>(new Map());
	const [error, setError] = useState<string | null>(null);

	// Initialise the Agora client once on mount.
	useEffect(() => {
		let cancelled = false;

		(async () => {
			const client = await getAgoraClient();
			if (cancelled) return;
			clientRef.current = client;

			// ── Remote user published (they started audio) ──────────────────────
			client.on("user-published", async (user, mediaType) => {
				await client.subscribe(user, mediaType);
				if (mediaType === "audio") {
					user.audioTrack?.play();
					setRemoteUsers((prev) =>
						prev.find((u) => u.uid === user.uid)
							? prev.map((u) => (u.uid === user.uid ? user : u))
							: [...prev, user],
					);
				}
			});

			// ── Remote user unpublished ───────────────────────────────────────────
			client.on("user-unpublished", (user) => {
				setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
				setRemoteVolumes((prev) => {
					const next = new Map(prev);
					next.delete(user.uid);
					return next;
				});
			});

			// ── Remote user left ──────────────────────────────────────────────────
			client.on("user-left", (user) => {
				setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
				setRemoteVolumes((prev) => {
					const next = new Map(prev);
					next.delete(user.uid);
					return next;
				});
			});

			// ── Volume indicator (fires every ~200 ms when enabled) ───────────────
			client.on("volume-indicator", (volumes) => {
				let localLvl = 0;
				const remoteMap = new Map<string | number, number>();

				volumes.forEach((entry) => {
					const normalised = Math.min(entry.level / 100, 1);
					// Agora marks the local user with the uid we joined with.
					// 'entry.uid === 0' means the local track.
					if (entry.uid === 0) {
						localLvl = normalised;
					} else {
						remoteMap.set(entry.uid, normalised);
					}
				});

				setLocalVolume(localLvl);
				setRemoteVolumes(remoteMap);
			});
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	// ─── Join ──────────────────────────────────────────────────────────────────
	const joinChannel = useCallback(
		async (
			roomId: string,
			userId: string,
			audioSettings?: Partial<AudioConstraints>,
		) => {
			if (!AGORA_APP_ID) {
				setError("NEXT_PUBLIC_AGORA_APP_ID is not set.");
				return;
			}

			try {
				setError(null);
				const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
				const client = clientRef.current ?? (await getAgoraClient());
				clientRef.current = client;

				// Fetch a secure token from the Supabase edge function.
				// uid 0 tells Agora to auto-assign a numeric UID server-side.
				const token = await fetchAgoraToken(roomId, 0);

				// Join with uid = 0 so Agora assigns the same UID the token was built for.
				await client.join(AGORA_APP_ID, roomId, token, 0);

				// Create microphone track.
				const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
					AEC: true, // Acoustic Echo Cancellation
					ANS: true, // Automatic Noise Suppression
					AGC: true, // Auto Gain Control
					...(audioSettings?.inputDeviceId && {
						microphoneId: audioSettings.inputDeviceId,
					}),
				});

				if (audioSettings?.inputVolume !== undefined) {
					micTrack.setVolume(Math.round(audioSettings.inputVolume * 100));
				}

				localTrackRef.current = micTrack;
				await client.publish([micTrack]);

				// Enable the volume indicator (~200 ms interval).
				client.enableAudioVolumeIndicator();

				setIsJoined(true);
				setIsMuted(false);
				setIsDeafened(false);
			} catch (err) {
				const msg =
					err instanceof Error ? err.message : "Failed to join Agora channel";
				console.error("[useAgoraVoice] joinChannel error:", err);
				setError(msg);
			}
		},
		[],
	);

	// ─── Leave ─────────────────────────────────────────────────────────────────
	const leaveChannel = useCallback(async () => {
		const client = clientRef.current;
		const track = localTrackRef.current;

		if (track) {
			track.stop();
			track.close();
			localTrackRef.current = null;
		}

		if (client && isJoined) {
			await client.leave();
		}

		setIsJoined(false);
		setRemoteUsers([]);
		setLocalVolume(0);
		setRemoteVolumes(new Map());
		setIsMuted(false);
		setIsDeafened(false);
	}, [isJoined]);

	// ─── Mute / Deafen ─────────────────────────────────────────────────────────
	const toggleMute = useCallback(() => {
		const track = localTrackRef.current;
		if (!track) return;

		const next = !isMuted;
		track.setEnabled(!next); // setEnabled(false) = muted
		setIsMuted(next);
	}, [isMuted]);

	const toggleDeafen = useCallback(() => {
		const client = clientRef.current;
		if (!client) return;

		const next = !isDeafened;

		// Mute all remote tracks locally (no network change).
		client.remoteUsers.forEach((user) => {
			user.audioTrack?.setVolume(next ? 0 : 100);
		});

		// Also mute self when deafening.
		if (next && !isMuted) {
			localTrackRef.current?.setEnabled(false);
			setIsMuted(true);
		} else if (!next) {
			localTrackRef.current?.setEnabled(true);
			setIsMuted(false);
		}

		setIsDeafened(next);
	}, [isDeafened, isMuted]);

	// ─── Cleanup on unmount ────────────────────────────────────────────────────
	useEffect(() => {
		return () => {
			localTrackRef.current?.stop();
			localTrackRef.current?.close();
		};
	}, []);

	return {
		joinChannel,
		leaveChannel,
		toggleMute,
		toggleDeafen,
		isMuted,
		isDeafened,
		isJoined,
		localVolume,
		remoteVolumes,
		remoteUsers,
		error,
	};
}
