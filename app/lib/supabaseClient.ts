import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error(
		"Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env variables.",
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
	id: string; // uuid – matches auth.uid() or a locally-generated uuid
	username: string;
	created_at?: string;
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
