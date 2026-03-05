import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Warn at runtime instead of throwing at module-load time.
// Throwing here crashes the Next.js static export build when the .env file
// is not present in the build environment (e.g. CI without secrets).
if (!supabaseUrl || !supabaseAnonKey) {
	console.warn(
		"[supabaseClient] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY " +
		"is not set. Supabase calls will fail until these are configured.",
	);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Calls your Supabase Edge Function to get a secure Agora token.
 * @param roomId - The name of the Agora channel (your Room ID)
 * @param userId - Optional: The integer UID for the user (0 for random)
 */
export const fetchAgoraToken = async (roomId: string, userId: number = 0) => {
	const { data, error } = await supabase.functions.invoke("get-agora-token", {
		body: {
			channelName: roomId,
			uid: userId,
		},
	});

	if (error) {
		console.error("Error fetching Agora token:", error);
		throw new Error("Failed to fetch voice token");
	}

	return data.token as string;
};

// ---------------------------------------------------------------------------
// Database types (matches your Supabase schema)
// ---------------------------------------------------------------------------

export interface Profile {
	id: string;
	display_name: string;
	tag: string;              // permanent, lowercase, e.g. "gabito"
	discriminator: string;    // 4-digit string, e.g. "0042"
	avatar_url?: string | null;
	created_at?: string;
}

// Helper — returns "gabito#0042"
export const formatTag = (profile: Pick<Profile, 'tag' | 'discriminator'>) =>
	`${profile.tag}#${profile.discriminator}`;

// Parse "gabito#0042" → { tag: "gabito", discriminator: "0042" }
export const parseTag = (full: string): { tag: string; discriminator: string } | null => {
	const match = full.match(/^([a-zA-Z0-9_.\-]+)#(\d{4})$/);
	if (!match) return null;
	return { tag: match[1].toLowerCase(), discriminator: match[2] };
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface FriendRequest {
	id: string;
	sender_id: string;
	receiver_id: string;
	status: FriendRequestStatus;
	created_at: string;
	updated_at: string;
	// joined
	sender?: Profile;
	receiver?: Profile;
}

export interface Friend {
	id: string;
	user_id: string;
	friend_id: string;
	created_at: string;
	// joined
	profile?: Profile;
}

export interface Room {
	id: string;
	name: string;
	host_id?: string;
	created_at?: string;
}

export interface Participant {
	id: string;
	room_id: string;
	user_id: string;
	username: string;
	avatar_url?: string | null;
	joined_at?: string;
}

export interface Message {
	id: string;
	room_id: string;
	user_id: string;
	username: string;
	content: string;
	created_at: string;
}
