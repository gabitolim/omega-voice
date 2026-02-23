/**
 * Lazy singleton for the Agora RTC client.
 * Imported only in client components or hooks (never on the server).
 *
 * TODO: When your Supabase edge function is ready, retrieve the token there
 * and pass it to `client.join(appId, channel, token, uid)`.
 * For now, pass `null` as the token (works in Agora test-mode projects).
 */

import type { IAgoraRTCClient } from "agora-rtc-sdk-ng";

// Module-level singleton – shared across the app's lifetime.
let _client: IAgoraRTCClient | null = null;

export async function getAgoraClient(): Promise<IAgoraRTCClient> {
	if (_client) return _client;

	// Dynamic import keeps the heavy SDK out of the SSR bundle.
	const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;

	// codec refers to video codec; for audio-only 'vp8' is the safe default.
	_client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
	return _client;
}

export const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID ?? "";
