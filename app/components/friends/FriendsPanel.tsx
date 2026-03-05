"use client";
import { useFriends } from "../../hooks/useFriends";
import AddFriendBar from "./AddFriendBar";
import FriendsList from "./FriendsList";

interface FriendsPanelProps {
	userId: string;
}

export default function FriendsPanel({ userId }: FriendsPanelProps) {
	const {
		friends,
		incoming,
		outgoing,
		loading,
		error,
		sendRequest,
		respondToRequest,
		removeFriend,
	} = useFriends(userId);

	return (
		<div className="flex flex-col h-full bg-[#1a1a2e]">
			<AddFriendBar onSend={sendRequest} />
			{loading && <p className="text-xs text-white/30 p-4">Loading...</p>}
			{error && <p className="text-xs text-red-400 p-4">{error}</p>}
			<FriendsList
				friends={friends}
				incoming={incoming}
				outgoing={outgoing}
				onAccept={(id) => respondToRequest(id, "accepted")}
				onDecline={(id) => respondToRequest(id, "declined")}
				onRemove={removeFriend}
			/>
		</div>
	);
}
