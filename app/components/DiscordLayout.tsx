"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import UserBar from "./UserBar";
import CreateRoomModal from "./CreateRoomModal";
import ToastContainer, { Toast } from "./ToastContainer";
import AudioSettingsModal, { AudioSettings } from "./AudioSettingsModal";
import ChatPanel, { ChatMessage } from "./ChatPanel";
import VoiceRoom from "./VoiceRoom";
import AuthScreen from "./AuthScreen";
import { useAgoraVoice } from "@/app/hooks/agora/useAgoraVoice";
import { supabase, type Room } from "@/app/lib/supabaseClient";

//  Types

interface VoiceRoom {
	id: string;
	name: string;
	userCount: number;
}

//  Component

export default function DiscordLayout() {
	//  Identity
	const [username, setUsername] = useState("");
	const [isUsernameSet, setIsUsernameSet] = useState(false);
	const [userId, setUserId] = useState("");

	//  UI State
	const [servers] = useState([{ id: "1", name: "Omega Server" }]);
	const [currentServer] = useState("1");
	const [rooms, setRooms] = useState<VoiceRoom[]>([]);
	const [currentRoom, setCurrentRoom] = useState<string | null>(null);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);

	//  Audio Settings
	const [audioSettings, setAudioSettings] = useState<AudioSettings>({
		inputDeviceId: "",
		outputDeviceId: "",
		inputVolume: 1.0,
		outputVolume: 1.0,
		vadThreshold: 0.3,
		pushToTalkEnabled: false,
		pushToTalkKey: "Space",
	});

	//  Agora Voice Hook (lifted so UserBar can read isMuted/isDeafened)
	const {
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
		error: agoraError,
	} = useAgoraVoice();

	const isPushToTalkActiveRef = useRef(false);

	//  Restore Supabase Auth session on mount
	useEffect(() => {
		const savedSettings = localStorage.getItem("omega-audio-settings");
		if (savedSettings) {
			try {
				setAudioSettings(JSON.parse(savedSettings));
			} catch {}
		}

		const resolveSession = async (userId: string) => {
			const { data } = await supabase
				.from("profiles")
				.select("id, username")
				.eq("id", userId)
				.single();
			if (data?.username) {
				setUserId(data.id);
				setUsername(data.username);
				setIsUsernameSet(true);
			}
		};

		// Covers both initial load (persisted session) and sign-in events
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
				resolveSession(session.user.id);
			} else if (event === "SIGNED_OUT" || !session) {
				setIsUsernameSet(false);
				setUsername("");
				setUserId("");
				setCurrentRoom(null);
				setMessages([]);
				setRooms([]);
			}
		});

		return () => subscription.unsubscribe();
	}, []);

	//  Load rooms from Supabase + subscribe to new ones
	useEffect(() => {
		if (!isUsernameSet) return;

		// Initial fetch
		supabase
			.from("rooms")
			.select("*")
			.order("created_at", { ascending: true })
			.then(({ data, error }) => {
				if (error) {
					showToast("Failed to load rooms: " + error.message, "error");
					return;
				}
				const loaded = (data as Room[]).map((r) => ({
					id: r.id,
					name: r.name,
					userCount: 0,
				}));
				setRooms(loaded);
			});

		// Realtime: new rooms created by other clients
		const channel = supabase
			.channel("rooms-list")
			.on(
				"postgres_changes",
				{ event: "INSERT", schema: "public", table: "rooms" },
				(payload) => {
					const r = payload.new as Room;
					setRooms((prev) =>
						prev.find((x) => x.id === r.id)
							? prev
							: [...prev, { id: r.id, name: r.name, userCount: 0 }],
					);
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUsernameSet]);

	//  Load chat messages for current room
	useEffect(() => {
		if (!currentRoom) {
			setMessages([]);
			return;
		}

		// Fetch history
		supabase
			.from("messages")
			.select("*")
			.eq("room_id", currentRoom)
			.order("created_at", { ascending: true })
			.limit(100)
			.then(({ data }) => {
				if (!data) return;
				setMessages(
					data.map((m) => ({
						id: m.id,
						userId: m.user_id,
						username: m.username,
						message: m.content,
						timestamp: m.created_at,
					})),
				);
			});

		// Realtime: new messages
		const channel = supabase
			.channel(`messages:room:${currentRoom}`)
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "messages",
					filter: `room_id=eq.${currentRoom}`,
				},
				(payload) => {
					const m = payload.new;
					setMessages((prev) => [
						...prev,
						{
							id: m.id,
							userId: m.user_id,
							username: m.username,
							message: m.content,
							timestamp: m.created_at,
						},
					]);
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [currentRoom]);

	//  Push-to-Talk
	useEffect(() => {
		if (!audioSettings.pushToTalkEnabled || !currentRoom) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === audioSettings.pushToTalkKey && !e.repeat) {
				isPushToTalkActiveRef.current = true;
				if (isMuted) toggleMute();
			}
		};
		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.code === audioSettings.pushToTalkKey) {
				isPushToTalkActiveRef.current = false;
				if (!isMuted) toggleMute();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [
		audioSettings.pushToTalkEnabled,
		audioSettings.pushToTalkKey,
		currentRoom,
		isMuted,
		toggleMute,
	]);

	//  Toast helper
	const showToast = useCallback(
		(message: string, type: Toast["type"] = "info", duration = 3000) => {
			const id = `${Date.now()}-${Math.random()}`;
			setToasts((prev) => [...prev, { id, message, type, duration }]);
		},
		[],
	);

	const removeToast = (id: string) =>
		setToasts((prev) => prev.filter((t) => t.id !== id));

	//  Join room
	const joinRoom = useCallback(
		async (roomId: string) => {
			if (currentRoom === roomId) return;

			// Leave current room first
			if (currentRoom) {
				await leaveChannel();
				setCurrentRoom(null);
			}

			// Join Agora channel
			await joinChannel(roomId, userId, {
				inputDeviceId: audioSettings.inputDeviceId,
				inputVolume: audioSettings.inputVolume,
			});

			setCurrentRoom(roomId);
			showToast(
				`Joined ${rooms.find((r) => r.id === roomId)?.name ?? roomId}`,
				"success",
			);
		},
		[
			currentRoom,
			leaveChannel,
			joinChannel,
			userId,
			audioSettings,
			rooms,
			showToast,
		],
	);

	//  Leave room
	const leaveRoom = useCallback(async () => {
		await leaveChannel();
		setCurrentRoom(null);
		setMessages([]);
	}, [leaveChannel]);

	//  Create room
	const handleCreateRoom = useCallback(
		async (roomName: string) => {
			const { error } = await supabase
				.from("rooms")
				.insert({ id: crypto.randomUUID(), name: roomName, host_id: userId });
			if (error) {
				throw new Error(error.message); // propagates to modal's inline error
			}
			showToast(`#${roomName} created`, "success");
		},
		[showToast, userId],
	);

	//  Send message
	const handleSendMessage = useCallback(
		async (content: string) => {
			if (!currentRoom) return;
			await supabase.from("messages").insert({
				room_id: currentRoom,
				user_id: userId,
				username,
				content,
			});
		},
		[currentRoom, userId, username],
	);

	//  Settings
	const handleEditUsername = async (newUsername: string) => {
		setUsername(newUsername);
		// Persist the change to Supabase profiles (best-effort)
		await supabase
			.from("profiles")
			.update({ username: newUsername })
			.eq("id", userId);
	};

	const handleSaveSettings = (newSettings: AudioSettings) => {
		setAudioSettings(newSettings);
		localStorage.setItem("omega-audio-settings", JSON.stringify(newSettings));
		showToast("Settings saved", "success");
	};

	//  Logout
	const handleLogout = useCallback(async () => {
		if (currentRoom) await leaveChannel();
		await supabase.auth.signOut();
		// onAuthStateChange will handle resetting state
	}, [currentRoom, leaveChannel]);

	//  Auth screen (register / login via Supabase profiles)
	if (!isUsernameSet) {
		return (
			<AuthScreen
				onSuccess={(resolvedId, resolvedUsername) => {
					setUserId(resolvedId);
					setUsername(resolvedUsername);
					setIsUsernameSet(true);
				}}
			/>
		);
	}

	//  Main layout
	return (
		<div className="flex h-screen bg-gray-700 text-white">
			{/* Sidebar */}
			<Sidebar
				servers={servers}
				currentServer={currentServer}
				onServerClick={() => {}}
				onHomeClick={() => {}}
			/>

			{/* Channel List + UserBar */}
			<div className="flex flex-col">
				<ChannelList
					serverName="Omega Server"
					rooms={rooms}
					currentRoom={currentRoom}
					onRoomClick={joinRoom}
					onCreateRoom={() => setIsCreateModalOpen(true)}
				/>
				<UserBar
					username={username}
					isMuted={isMuted}
					isDeafened={isDeafened}
					onToggleMute={toggleMute}
					onToggleDeafen={toggleDeafen}
					onEditUsername={handleEditUsername}
					onOpenSettings={() => setIsSettingsOpen(true)}
					onLogout={handleLogout}
				/>
			</div>

			{/* Main Content */}
			<div className="flex-1 flex flex-col bg-gray-700 overflow-hidden">
				{/* Top bar */}
				<div className="h-12 px-4 border-b border-gray-900 flex items-center flex-shrink-0">
					<svg
						className="w-5 h-5 text-gray-400 mr-2"
						fill="currentColor"
						viewBox="0 0 20 20"
					>
						<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
					</svg>
					<h2 className="font-semibold text-white">
						{currentRoom
							? (rooms.find((r) => r.id === currentRoom)?.name ?? currentRoom)
							: "No voice channel"}
					</h2>
					{currentRoom && (
						<button
							onClick={leaveRoom}
							className="ml-auto px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition"
						>
							Disconnect
						</button>
					)}
				</div>

				{/* Voice content */}
				<div className="flex-1 overflow-y-auto p-4">
					{!currentRoom ? (
						<div className="flex items-center justify-center h-full">
							<div className="text-center text-gray-400">
								<svg
									className="w-16 h-16 mx-auto mb-4 opacity-50"
									fill="currentColor"
									viewBox="0 0 20 20"
								>
									<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
								</svg>
								<p className="text-lg">Select a voice channel to get started</p>
							</div>
						</div>
					) : (
						<VoiceRoom
							key={currentRoom}
							roomId={currentRoom}
							roomName={
								rooms.find((r) => r.id === currentRoom)?.name ?? currentRoom
							}
							userId={userId}
							username={username}
							isJoined={isJoined}
							isMuted={isMuted}
							isDeafened={isDeafened}
							localVolume={localVolume}
							remoteVolumes={remoteVolumes}
							remoteUsers={remoteUsers}
							agoraError={agoraError}
							onToggleMute={toggleMute}
							onToggleDeafen={toggleDeafen}
							onLeave={leaveRoom}
						/>
					)}
				</div>
			</div>

			{/* Chat Panel */}
			{currentRoom && (
				<ChatPanel
					roomName={
						rooms.find((r) => r.id === currentRoom)?.name ?? currentRoom
					}
					messages={messages}
					currentUsername={username}
					onSendMessage={handleSendMessage}
				/>
			)}

			{/* Modals */}
			<CreateRoomModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onCreateRoom={handleCreateRoom}
			/>
			<AudioSettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
				onSave={handleSaveSettings}
				currentSettings={audioSettings}
			/>

			{/* Toasts */}
			<ToastContainer toasts={toasts} onRemove={removeToast} />
		</div>
	);
}
