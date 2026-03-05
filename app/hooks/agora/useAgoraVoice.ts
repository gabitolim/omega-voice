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
	/**
	 * Apply a new output volume (0–1) to all currently-subscribed remote tracks.
	 * Call this whenever the user saves new audio settings while already in a room.
	 */
	applyOutputVolume: (volume: number) => void;
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
	outputDeviceId?: string;
	inputVolume?: number;
	outputVolume?: number;
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
					// Add to remoteUsers if not already present
					setRemoteUsers((prev) =>
						prev.find((u) => u.uid === user.uid)
							? prev.map((u) => (u.uid === user.uid ? user : u))
							: [...prev, user],
					);
				}
			});

			// ── Remote user unpublished ─────────────────────────────────────────
			// FIXED: Only stop/mute the audio track — do NOT remove the user
			// from remoteUsers. A user can unpublish (mute) without leaving the
			// channel. Removing them here caused participants to vanish on mute.
			client.on("user-unpublished", (user, mediaType) => {
				if (mediaType === "audio") {
					user.audioTrack?.stop();
					// Zero out their volume entry
					setRemoteVolumes((prev) => {
						const next = new Map(prev);
						next.set(user.uid, 0);
						return next;
					});
				}
			});

			// ── Remote user left (actually disconnected) ──────────────────────
			client.on("user-left", (user) => {
				setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
				setRemoteVolumes((prev) => {
					const next = new Map(prev);
					next.delete(user.uid);
					return next;
				});
			});

			// ── Volume indicator (fires every ~200 ms when enabled) ────────────
			// FIXED: Compare against client.uid (the UID assigned after join)
			// instead of entry.uid === 0, which is never true after a real join.
			client.on("volume-indicator", (volumes) => {
				const localUid = client.uid;
				let localLvl = 0;
				const remoteMap = new Map<string | number, number>();

				volumes.forEach((entry) => {
					const normalised = Math.min(entry.level / 100, 1);
					if (entry.uid === localUid) {
						localLvl = normalised;
					} else {
						remoteMap.set(entry.uid, normalised);
					}
				});

				setLocalVolume(localLvl);
				setRemoteVolumes(remoteMap);
			});

			// ── Connection state change (network drop handling) ────────────────
			client.on("connection-state-change", (curState, prevState, reason) => {
				console.warn(
					`[useAgoraVoice] connection-state-change: ${prevState} → ${curState}`,
					reason ?? "",
				);
				if (curState === "DISCONNECTED" && prevState === "CONNECTED") {
					setError("Voice connection lost. Please rejoin.");
					setIsJoined(false);
				} else if (curState === "CONNECTED") {
					setError(null);
				}
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

				// Guard: if still connected (e.g. after a hot-reload the singleton
				// retains its session while React state resets), force-leave first
				// so we can do a clean rejoin instead of hanging on the spinner.
				if (client.connectionState !== "DISCONNECTED") {
					console.warn("[useAgoraVoice] Client not disconnected — force-leaving before rejoin.");
					try {
						if (localTrackRef.current) {
							localTrackRef.current.stop();
							localTrackRef.current.close();
							localTrackRef.current = null;
						}
						await client.leave();
					} catch (e) {
						console.warn("[useAgoraVoice] Force-leave failed:", e);
					}
				}

				// Fetch a secure token from the Supabase edge function.
				// uid 0 tells Agora to auto-assign a numeric UID server-side.
				const token = await fetchAgoraToken(roomId, 0);

				// Join with uid = 0 so Agora assigns the same UID the token was built for.
				await client.join(AGORA_APP_ID, roomId, token, 0);

				// Create microphone track with audio enhancement.
				// Falls back to plain track (no AEC/ANS/AGC) if the browser blocks
				// the audio processing pipeline (e.g. Brave), then falls back to
				// listen-only if no mic device is available at all.
				let micTrack: IMicrophoneAudioTrack | null = null;
				try {
					micTrack = await AgoraRTC.createMicrophoneAudioTrack({
						AEC: true,
						ANS: true,
						AGC: true,
						...(audioSettings?.inputDeviceId && {
							microphoneId: audioSettings.inputDeviceId,
						}),
					});
				} catch (micErr) {
					const code = (micErr as { code?: string })?.code ?? "";
					if (code === "UNEXPECTED_ERROR") {
						// Browser (e.g. Brave) blocked the audio processing pipeline —
						// retry without AEC/ANS/AGC constraints.
						console.warn("[useAgoraVoice] Audio processing blocked, retrying without constraints.", micErr);
						try {
							micTrack = await AgoraRTC.createMicrophoneAudioTrack({
								AEC: false,
								ANS: false,
								AGC: false,
								// Don't pass microphoneId on retry — the stored device ID
								// may be stale or invalid in this browser context.
							});
						} catch (retryErr) {
							console.warn("[useAgoraVoice] Retry also failed — joining listen-only.", retryErr);
							setError("Microphone unavailable. Joined in listen-only mode.");
						}
					} else if (code === "DEVICE_NOT_FOUND" || code === "PERMISSION_DENIED") {
						console.warn("[useAgoraVoice] Microphone unavailable — joining listen-only.", micErr);
						setError("No microphone found. Joined in listen-only mode.");
					} else {
						throw micErr;
					}
				}

				if (micTrack) {
					if (audioSettings?.inputVolume !== undefined) {
						micTrack.setVolume(Math.round(audioSettings.inputVolume * 100));
					}
					localTrackRef.current = micTrack;
					await client.publish([micTrack]);
				}

				// Apply output volume to any already-connected remote users.
				// FIXED: outputVolume setting is now actually applied.
				if (audioSettings?.outputVolume !== undefined) {
					const outputVol = Math.round(audioSettings.outputVolume * 100);
					client.remoteUsers.forEach((user) => {
						user.audioTrack?.setVolume(outputVol);
					});
				}

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

		// Use the client's actual connection state (not React's isJoined) so
		// this works correctly after hot-reloads where state has been reset.
		if (client && client.connectionState !== "DISCONNECTED") {
			await client.leave();
		}

		setIsJoined(false);
		setRemoteUsers([]);
		setLocalVolume(0);
		setRemoteVolumes(new Map());
		setIsMuted(false);
		setIsDeafened(false);
	}, []);

	// ─── Update output volume on all remote tracks ─────────────────────────────
	// Exposed so DiscordLayout can call this when audio settings change.
	const applyOutputVolume = useCallback((volume: number) => {
		const client = clientRef.current;
		if (!client) return;
		const vol = Math.round(volume * 100);
		client.remoteUsers.forEach((user) => {
			user.audioTrack?.setVolume(vol);
		});
	}, []);

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
		applyOutputVolume,
		isMuted,
		isDeafened,
		isJoined,
		localVolume,
		remoteVolumes,
		remoteUsers,
		error,
	};
}
