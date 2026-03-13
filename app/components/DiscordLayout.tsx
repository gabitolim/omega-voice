"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import UserBar from "./UserBar";
import CreateRoomModal from "./CreateRoomModal";
import ToastContainer, { Toast } from "./ToastContainer";
import AudioSettingsModal, { AudioSettings } from "./AudioSettingsModal";
import ChatPanel, { ChatMessage } from "./ChatPanel";
import VoiceRoom, { type RoomParticipant } from "./VoiceRoom";
import AuthScreen from "./AuthScreen";
import FriendsPanel from "./friends/FriendsPanel";
import MemberList, { type MemberEntry } from "./MemberList";
import { useAgoraVoice } from "@/app/hooks/agora/useAgoraVoice";
import { supabase, type Room, type Participant } from "@/app/lib/supabaseClient";
import { useColumnResize } from "@/app/hooks/useColumnResize";

//  Types

/** Represents a single row from the `rooms` table as shown in the channel list. */
interface RoomListItem {
	id: string;
	name: string;
	userCount: number;
}

//  The general server chat is pinned to this fixed room UUID.
//  We upsert this row into the rooms table on login so FK constraints are satisfied.
const GENERAL_CHAT_ROOM_ID = "00000000-0000-0000-0000-000000000001";

//  Component

export default function DiscordLayout() {
	//  Identity
	const [username, setUsername] = useState("");
	const [isUsernameSet, setIsUsernameSet] = useState(false);
	const [isAuthLoading, setIsAuthLoading] = useState(true);
	const [userId, setUserId] = useState("");
	const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
	const [tag, setTag] = useState<string | undefined>(undefined);
	const [discriminator, setDiscriminator] = useState<string | undefined>(
		undefined,
	);

	//  UI State
	const [servers] = useState([{ id: "1", name: "Omega Server" }]);
	const [currentServer] = useState("1");
	const [rooms, setRooms] = useState<RoomListItem[]>([]);
	const [currentRoom, setCurrentRoom] = useState<string | null>(null);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);

	//  Participants in the current voice room (fed from VoiceRoom headless)
	const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);

	//  All participants across all rooms (for channel list display)
	type RoomUserEntry = { user_id: string; username: string; avatar_url: string | null };
	const [allParticipants, setAllParticipants] = useState<Map<string, RoomUserEntry[]>>(new Map());

	//  Online members tracked via Supabase Presence (server-level)
	const [onlineMembers, setOnlineMembers] = useState<Map<string, MemberEntry>>(new Map());

	//  Top-level view: "server" = normal voice/chat layout, "friends" = friends panel
	const [view, setView] = useState<"server" | "friends">("server");

	//  Mobile navigation (which panel is visible on small screens)
	const [mobileView, setMobileView] = useState<"channels" | "chat" | "friends" | "members">("channels");

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
		applyOutputVolume,
		isMuted,
		isDeafened,
		isJoined,
		localVolume,
		remoteVolumes,
		error: agoraError,
	} = useAgoraVoice();

	const isPushToTalkActiveRef = useRef(false);

	// ── Settings helpers (Electron IPC if available, localStorage fallback) ──
	type ElectronAPI = {
		showNotification: (t: string, b: string) => void;
		getSetting: (key: string) => Promise<unknown>;
		setSetting: (key: string, value: unknown) => Promise<void>;
	};
	const electronAPI = typeof window !== "undefined"
		? (window as Window & { electronAPI?: ElectronAPI }).electronAPI
		: undefined;

	const loadSetting = useCallback(async (key: string): Promise<string | null> => {
		if (electronAPI?.getSetting) {
			const val = await electronAPI.getSetting(key);
			return val != null ? String(val) : null;
		}
		return localStorage.getItem(key);
	}, [electronAPI]);

	const saveSetting = useCallback(async (key: string, value: string) => {
		if (electronAPI?.setSetting) {
			await electronAPI.setSetting(key, value);
		} else {
			localStorage.setItem(key, value);
		}
	}, [electronAPI]);

	//  Restore Supabase Auth session on mount
	useEffect(() => {
		// Load persisted audio settings (prefer Electron store, fall back to localStorage)
		loadSetting("omega-audio-settings").then((savedSettings) => {
			if (savedSettings) {
				try {
					setAudioSettings(JSON.parse(savedSettings));
				} catch {}
			}
		});

		const resolveSession = async (userId: string) => {
			// Clean up any stale participant rows left over from a previous session
			// that ended abruptly (tab closed, crash, dev-server restart, etc.).
			await supabase.from("participants").delete().eq("user_id", userId);

			// 1. Try the profiles table first.
			const { data, error } = await supabase
				.from("profiles")
				.select("id, username, display_name, avatar_url, tag, discriminator")
				.eq("id", userId)
				.single();

			if (error && error.code !== "PGRST116") {
				console.error("[resolveSession] Profile fetch error:", error);
			}

			const resolvedName = data?.display_name || data?.username || "";
			if (resolvedName) {
				setUserId(data!.id);
				setUsername(resolvedName);
				setAvatarUrl(data?.avatar_url ?? null);
				setTag(data?.tag ?? undefined);
				setDiscriminator(data?.discriminator ?? undefined);
				setIsUsernameSet(true);
				setIsAuthLoading(false);
				return;
			}

			// 2. Profile row missing or username is NULL — fall back to auth metadata.
			const {
				data: { user },
			} = await supabase.auth.getUser();
			const metaUsername = user?.user_metadata?.username as string | undefined;
			if (metaUsername) {
				// Backfill the profile row now that we have a valid session.
				await supabase
					.from("profiles")
					.upsert({ id: userId, username: metaUsername }, { onConflict: "id" });

				setUserId(userId);
				setUsername(metaUsername);
				setAvatarUrl(null);
				setIsUsernameSet(true);
			}
			setIsAuthLoading(false);
		};

		// Covers both initial load (persisted session) and sign-in events
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (
				(event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
				session?.user
			) {
				resolveSession(session.user.id);
			} else if (event === "SIGNED_OUT" || !session) {
				setIsUsernameSet(false);
				setIsAuthLoading(false);
				setUsername("");
				setUserId("");
				setAvatarUrl(null);
				setTag(undefined);
				setDiscriminator(undefined);
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

		// Ensure the general chat room exists (upsert so FK constraints on messages are satisfied)
		supabase
			.from("rooms")
			.upsert(
				{ id: GENERAL_CHAT_ROOM_ID, name: "general", host_id: userId },
				{ onConflict: "id", ignoreDuplicates: true },
			)
			.then(({ error }) => {
				if (error) console.warn("[general room upsert]", error.message);
			});

		// Initial fetch
		supabase
			.from("rooms")
			.select("*")
			.neq("id", GENERAL_CHAT_ROOM_ID)
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

		// Realtime: rooms created or deleted by other clients
		const channel = supabase
			.channel("rooms-list")
			.on(
				"postgres_changes",
				{ event: "INSERT", schema: "public", table: "rooms" },
				(payload) => {
					const r = payload.new as Room;
					if (r.id === GENERAL_CHAT_ROOM_ID) return;
					setRooms((prev) =>
						prev.find((x) => x.id === r.id)
							? prev
							: [...prev, { id: r.id, name: r.name, userCount: 0 }],
					);
				},
			)
			.on(
				"postgres_changes",
				{ event: "DELETE", schema: "public", table: "rooms" },
				(payload) => {
					const deletedId = (payload.old as Partial<Room>).id;
					if (!deletedId || deletedId === GENERAL_CHAT_ROOM_ID) return;
					setRooms((prev) => prev.filter((r) => r.id !== deletedId));
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUsernameSet]);

	//  Global participants subscription (all rooms, for channel list)
	const buildAllParticipantsMap = useCallback(async () => {
		const { data: rows } = await supabase
			.from("participants")
			.select("room_id, user_id, username");

		if (!rows || rows.length === 0) {
			setAllParticipants(new Map());
			return;
		}

		const ids = [...new Set((rows as Participant[]).map((r) => r.user_id))];
		const { data: profiles } = await supabase
			.from("profiles")
			.select("id, avatar_url")
			.in("id", ids);
		const avatarMap = new Map(
			((profiles ?? []) as { id: string; avatar_url: string | null }[]).map(
				(p) => [p.id, p.avatar_url],
			),
		);

		const map = new Map<string, RoomUserEntry[]>();
		(rows as Participant[]).forEach((r) => {
			const entry = {
				user_id: r.user_id,
				username: r.username,
				avatar_url: avatarMap.get(r.user_id) ?? null,
			};
			const list = map.get(r.room_id) ?? [];
			if (!list.find((x) => x.user_id === r.user_id)) list.push(entry);
			map.set(r.room_id, list);
		});
		setAllParticipants(map);
	}, []);

	useEffect(() => {
		if (!isUsernameSet) return;

		buildAllParticipantsMap();

		const channel = supabase
			.channel("all-participants")
			.on(
				"postgres_changes",
				{ event: "INSERT", schema: "public", table: "participants" },
				async (payload) => {
					const p = payload.new as Participant;
					const { data: prof } = await supabase
						.from("profiles")
						.select("avatar_url")
						.eq("id", p.user_id)
						.single();
					setAllParticipants((prev) => {
						const next = new Map(prev);
						const list = next.get(p.room_id) ?? [];
						if (!list.find((x) => x.user_id === p.user_id)) {
							next.set(p.room_id, [
								...list,
								{ user_id: p.user_id, username: p.username, avatar_url: prof?.avatar_url ?? null },
							]);
						}
						return next;
					});
				},
			)
			.on(
				"postgres_changes",
				{ event: "DELETE", schema: "public", table: "participants" },
				(payload) => {
					const old = payload.old as Partial<Participant>;
					// If old row data is missing (replica identity not FULL), refetch everything
					if (!old.room_id || !old.user_id) {
						buildAllParticipantsMap();
						return;
					}
					setAllParticipants((prev) => {
						const next = new Map(prev);
						const list = (next.get(old.room_id!) ?? []).filter(
							(x) => x.user_id !== old.user_id,
						);
						next.set(old.room_id!, list);
						return next;
					});
				},
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [isUsernameSet, buildAllParticipantsMap]);

	//  Active chat room: if in a voice room use its id, otherwise fall back to #general
	const activeChatRoomId = currentRoom ?? GENERAL_CHAT_ROOM_ID;
	const activeChatRoomName =
		rooms.find((r) => r.id === activeChatRoomId)?.name ?? "general";

	//  Chat — fetch history + subscribe, re-runs whenever the active chat room changes
	useEffect(() => {
		if (!isUsernameSet || !userId) return;

		let channel: ReturnType<typeof supabase.channel> | null = null;
		let cancelled = false;

		// Clear stale messages immediately when switching rooms
		setMessages([]);

		const init = async () => {
			// 1. Ensure the general chat room row exists (only needed for the fallback room)
			if (activeChatRoomId === GENERAL_CHAT_ROOM_ID) {
				await supabase
					.from("rooms")
					.upsert(
						{ id: GENERAL_CHAT_ROOM_ID, name: "general", host_id: userId },
						{ onConflict: "id", ignoreDuplicates: true },
					);
			}

			if (cancelled) return;

			// 2. Fetch message history for this room
			const { data } = await supabase
				.from("messages")
				.select("*")
				.eq("room_id", activeChatRoomId)
				.order("created_at", { ascending: true })
				.limit(100);

			if (cancelled) return;

			setMessages(
				(data ?? []).map((m) => ({
					id: m.id,
					userId: m.user_id,
					username: m.username,
					message: m.content,
					timestamp: m.created_at,
				})),
			);

			// 3. Subscribe to realtime new messages in this room
			channel = supabase
				.channel(`messages:${activeChatRoomId}`)
				.on(
					"postgres_changes",
					{
						event: "INSERT",
						schema: "public",
						table: "messages",
						filter: `room_id=eq.${activeChatRoomId}`,
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
						// Fire a native OS notification when a message arrives from someone else
						// and the window is not focused
						if (
							m.user_id !== userId &&
							!document.hasFocus() &&
							typeof window !== "undefined" &&
							(window as Window & { electronAPI?: { showNotification: (t: string, b: string) => void } }).electronAPI
						) {
							(window as Window & { electronAPI?: { showNotification: (t: string, b: string) => void } }).electronAPI!.showNotification(
								m.username,
								m.content,
							);
						}
					},
				)
				.subscribe();
		};

		init();

		return () => {
			cancelled = true;
			if (channel) supabase.removeChannel(channel);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUsernameSet, userId, activeChatRoomId]);

	// Apply output volume to all remote tracks whenever the setting changes mid-session.
	useEffect(() => {
		if (isJoined) {
			applyOutputVolume(audioSettings.outputVolume);
		}
	}, [audioSettings.outputVolume, isJoined, applyOutputVolume]);

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

	//  On first login, start on channels tab; chat is always available
	useEffect(() => {
		if (isUsernameSet) {
			setMobileView("channels");
		}
	}, [isUsernameSet]);

	//  Toast helper
	const showToast = useCallback(
		(message: string, type: Toast["type"] = "info", duration = 3000) => {
			const id = `${Date.now()}-${Math.random()}`;
			setToasts((prev) => [...prev, { id, message, type, duration }]);
		},
		[],
	);

	const removeToast = useCallback(
		(id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
		[],
	);

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
				outputVolume: audioSettings.outputVolume,
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
		const leavingRoom = currentRoom;
		await leaveChannel();
		setCurrentRoom(null);
		setRoomParticipants([]);
		// Eagerly remove self from allParticipants so the list updates instantly
		if (leavingRoom) {
			setAllParticipants((prev) => {
				const next = new Map(prev);
				next.set(
					leavingRoom,
					(next.get(leavingRoom) ?? []).filter((x) => x.user_id !== userId),
				);
				return next;
			});
			// Refetch after a short delay to pick up any other users that also left
			setTimeout(() => buildAllParticipantsMap(), 1500);
		}
	}, [leaveChannel, currentRoom, userId, buildAllParticipantsMap]);

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

	//  Delete room (owner only)
	const handleDeleteRoom = useCallback(
		async (roomId: string) => {
			// Verify ownership before deleting
			const { data: room } = await supabase
				.from("rooms")
				.select("host_id, name")
				.eq("id", roomId)
				.single();

			if (!room) return;
			if (room.host_id !== userId) {
				showToast("Only the room owner can delete channels", "error");
				return;
			}

			// Leave room first if we're in it
			if (currentRoom === roomId) await leaveRoom();

			const { error } = await supabase.from("rooms").delete().eq("id", roomId);
			if (error) {
				showToast("Failed to delete channel: " + error.message, "error");
			} else {
				showToast(`#${room.name} deleted`, "success");
			}
		},
		[userId, currentRoom, leaveRoom, showToast],
	);

	//  Send message (targets the currently active chat room)
	const handleSendMessage = useCallback(
		async (content: string) => {
			await supabase.from("messages").insert({
				room_id: activeChatRoomId,
				user_id: userId,
				username,
				content,
			});
		},
		[activeChatRoomId, userId, username],
	);

	//  Profile update (called by ProfileModal via UserBar)
	const handleProfileUpdated = useCallback(
		(newDisplayName: string, newAvatarUrl: string | null) => {
			setUsername(newDisplayName);
			setAvatarUrl(newAvatarUrl);
		},
		[],
	);

	const handleSaveSettings = (newSettings: AudioSettings) => {
		setAudioSettings(newSettings);
		saveSetting("omega-audio-settings", JSON.stringify(newSettings));
		showToast("Settings saved", "success");
	};

	//  Logout
	const handleLogout = useCallback(async () => {
		if (currentRoom) await leaveChannel();
		await supabase.auth.signOut();
		// onAuthStateChange will handle resetting state
	}, [currentRoom, leaveChannel]);

	// Merge live participants into rooms so ChannelList shows them Discord-style
	// Must be before any early returns to satisfy Rules of Hooks
	const roomsWithUsers = useMemo(() => rooms.map((r) => {
		if (r.id === currentRoom) {
			return {
				...r,
				userCount: roomParticipants.length,
				users: roomParticipants.map((p) => ({
					user_id: p.user_id,
					username: p.username,
					avatar_url: p.avatar_url ?? null,
					isSpeaking: p.isSpeaking,
				})),
			};
		}
		const others = allParticipants.get(r.id) ?? [];
		return {
			...r,
			userCount: others.length,
			users: others.map((p) => ({ ...p, isSpeaking: false })),
		};
	}), [rooms, currentRoom, roomParticipants, allParticipants]);

	//  Supabase Presence — track who is online server-wide
	useEffect(() => {
		if (!isUsernameSet || !userId) return;

		const ch = supabase.channel("server-online", {
			config: { presence: { key: userId } },
		});

		ch.on("presence", { event: "sync" }, () => {
			const state = ch.presenceState<{ user_id: string; username: string; avatar_url: string | null }>();
			const map = new Map<string, MemberEntry>();
			Object.values(state).forEach((presences) => {
				presences.forEach((p) => {
					map.set(p.user_id, {
						user_id: p.user_id,
						username: p.username,
						avatar_url: p.avatar_url,
					});
				});
			});
			setOnlineMembers(map);
		}).subscribe(async (status) => {
			if (status === "SUBSCRIBED") {
				await ch.track({ user_id: userId, username, avatar_url: avatarUrl });
			}
		});

		return () => {
			ch.untrack();
			supabase.removeChannel(ch);
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUsernameSet, userId, username, avatarUrl]);

	//  Flatten the online members map for MemberList
	const onlineMembersList = useMemo<MemberEntry[]>(
		() => Array.from(onlineMembers.values()),
		[onlineMembers],
	);

	const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
	const handleOpenCreateRoom = useCallback(() => setIsCreateModalOpen(true), []);
	const handleCloseCreateRoom = useCallback(() => setIsCreateModalOpen(false), []);
	const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
	const noop = useCallback(() => {}, []);

	// Toggle between the server view and the friends panel
	const handleHomeClick = useCallback(() => {
		setView((v) => (v === "friends" ? "server" : "friends"));
		setMobileView("friends");
	}, []);
	const handleServerClick = useCallback(() => {
		setView("server");
		setMobileView("channels");
	}, []);

	// Column resize
	const [sidebarWidth, sidebarDragProps] = useColumnResize({ defaultWidth: 72, minWidth: 56, maxWidth: 120, storageKey: "col-sidebar" });
	const [channelWidth, channelDragProps] = useColumnResize({ defaultWidth: 256, minWidth: 160, maxWidth: 400, storageKey: "col-channel" });
	const [memberListWidth, memberDragProps] = useColumnResize({ defaultWidth: 240, minWidth: 160, maxWidth: 360, storageKey: "col-members" });

	//  While we're checking for a persisted Supabase session, show a neutral
	//  loading screen so the auth form never flashes on screen before being
	//  immediately dismissed by an INITIAL_SESSION event.
	if (isAuthLoading) {
		return (
			<div className="flex h-[100dvh] items-center justify-center bg-gray-800">
				<div className="flex flex-col items-center gap-3">
					<div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
					<p className="text-gray-400 text-sm">Connecting…</p>
				</div>
			</div>
		);
	}

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
		<div className="flex flex-col h-[100dvh] text-white overflow-hidden">
			{/* ─ Horizontal layout (flex-row on md+) ─────────────────────── */}
			<div className="flex-1 flex flex-row overflow-hidden min-h-0 bg-gray-700">
				{/* Sidebar — desktop only */}
				<div className="hidden md:flex flex-col flex-shrink-0" style={{ width: sidebarWidth }}>
					<Sidebar
						servers={servers}
						currentServer={view === "server" ? currentServer : null}
						onServerClick={handleServerClick}
						onHomeClick={handleHomeClick}
					/>
				</div>

				{/* Drag handle: sidebar | main content */}
				<div
					{...sidebarDragProps}
					className="hidden md:flex w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-500/40 active:bg-indigo-500/70 transition-colors group relative"
					title="Drag to resize"
				>
					<div className="absolute inset-y-0 -left-1 -right-1" />
				</div>

				{/* ── Friends view ──────────────────────────────────────────── */}
				{view === "friends" && (
					<div
						className={`${
							mobileView === "friends" ? "flex" : "hidden"
						} md:flex flex-1 flex-col overflow-hidden`}
					>
						<FriendsPanel userId={userId} />
					</div>
				)}

				{/* ── Server view: Channel List + Chat ─────────────────────── */}
				{view === "server" && (
					<>
						{/* Channel List + UserBar */}
						<div
							className={`${mobileView === "channels" ? "flex" : "hidden"} md:flex flex-col flex-shrink-0 overflow-hidden`}
							style={{ width: channelWidth }}
						>
						<ChannelList
							serverName="Omega Server"
							rooms={roomsWithUsers}
							currentRoom={currentRoom}
							onRoomClick={joinRoom}
							onCreateRoom={handleOpenCreateRoom}
							onDeleteRoom={handleDeleteRoom}
						/>

							{/* Voice connected strip — shows above UserBar when in a room */}
							{currentRoom && (
								<div className="flex items-center justify-between px-3 py-2 bg-gray-900/80 border-t border-green-700/40">
									<div className="flex items-center gap-2 min-w-0">
										<span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 animate-pulse" />
										<div className="min-w-0">
											<p className="text-green-400 text-xs font-semibold leading-tight">Voice Connected</p>
											<p className="text-gray-400 text-[10px] truncate leading-tight">
												{rooms.find((r) => r.id === currentRoom)?.name ?? currentRoom}
											</p>
										</div>
									</div>
									<button
										onClick={leaveRoom}
										className="p-1.5 rounded hover:bg-red-700/30 text-gray-400 hover:text-red-400 transition flex-shrink-0"
										title="Disconnect from voice"
									>
										<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
											<path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
										</svg>
									</button>
								</div>
							)}

							<UserBar
								userId={userId}
								username={username}
								avatarUrl={avatarUrl}
								tag={tag}
								discriminator={discriminator}
								isMuted={isMuted}
								isDeafened={isDeafened}
								onToggleMute={toggleMute}
								onToggleDeafen={toggleDeafen}
								onProfileUpdated={handleProfileUpdated}
								onOpenSettings={handleOpenSettings}
								onLogout={handleLogout}
							/>
						</div>

						{/* Drag handle: channel list | chat */}
						<div
							{...channelDragProps}
							className="hidden md:flex w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-500/40 active:bg-indigo-500/70 transition-colors relative"
							title="Drag to resize"
						>
							<div className="absolute inset-y-0 -left-1 -right-1" />
						</div>

						{/* Chat column */}
						<div
							className={`${
								mobileView === "chat" ? "flex" : "hidden"
							} md:flex flex-1 flex-col bg-gray-700 overflow-hidden`}
						>
							{/* Top bar — shows active room name */}
							<div className="h-12 px-4 border-b border-gray-900 flex items-center gap-2 flex-shrink-0">
								<svg
									className="w-5 h-5 text-gray-400 flex-shrink-0"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path fill="currentColor" d="M5.068 3h13.864C20.065 3 21 3.935 21 5.068v13.864A2.068 2.068 0 0 1 18.932 21H5.068A2.068 2.068 0 0 1 3 18.932V5.068A2.068 2.068 0 0 1 5.068 3m1.989 11.862h3.476L8.648 18h1.989l1.885-3.138h2.317V13.01h-1.695l.842-1.404h.853V9.754h-1.548l.924-1.539H11.23l-.924 1.54H8.12v1.851h1.274l-.842 1.404H6.989v1.852Z"/>
								</svg>
								<h2 className="font-semibold text-white truncate flex-1">{activeChatRoomName}</h2>
							</div>

							{/* Headless VoiceRoom — runs hooks, renders connecting/error banner only */}
							{currentRoom && (
								<div className="px-3 pt-3 md:px-4 md:pt-4 flex-shrink-0">
									<VoiceRoom
										key={currentRoom}
										roomId={currentRoom}
										userId={userId}
										username={username}
										isJoined={isJoined}
										localVolume={localVolume}
										remoteVolumes={remoteVolumes}
										agoraError={agoraError}
										vadThreshold={audioSettings.vadThreshold}
										onParticipantsChange={setRoomParticipants}
									/>
								</div>
							)}

							{/* Chat fills all remaining space */}
							<ChatPanel
								roomName={activeChatRoomName}
								messages={messages}
								currentUsername={username}
								onSendMessage={handleSendMessage}
							/>
						</div>

						{/* Drag handle: chat | member list */}
						<div
							{...memberDragProps}
							className="hidden md:flex w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-indigo-500/40 active:bg-indigo-500/70 transition-colors relative"
							title="Drag to resize"
						>
							<div className="absolute inset-y-0 -left-1 -right-1" />
						</div>

						{/* Member List column */}
						<div
							className={`${
								mobileView === "members" ? "flex" : "hidden"
							} md:flex flex-col flex-shrink-0 overflow-hidden`}
							style={{ width: memberListWidth }}
						>
							<MemberList
								onlineMembers={onlineMembersList}
								currentUserId={userId}
							/>
						</div>
					</>
				)}
			</div>

			{/* ─ Mobile bottom navigation (3 tabs) ─────────────────────── */}
			<nav
				className="md:hidden flex-shrink-0 flex items-stretch bg-gray-900 border-t border-gray-700/50"
				style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
			>
				{/* Channels tab */}
				<button
					onClick={() => { setView("server"); setMobileView("channels"); }}
					className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium transition active:opacity-60 ${
						mobileView === "channels" ? "text-indigo-400" : "text-gray-500"
					}`}
				>
					<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
						<path
							fillRule="evenodd"
							d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 5a1 1 0 100 2h12a1 1 0 100-2H4z"
							clipRule="evenodd"
						/>
					</svg>
					Channels
				</button>

				{/* Chat tab */}
				<button
					onClick={() => { setView("server"); setMobileView("chat"); }}
					className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium transition active:opacity-60 ${
						mobileView === "chat" ? "text-indigo-400" : "text-gray-500"
					}`}
				>
					<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
						<path
							fillRule="evenodd"
							d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
							clipRule="evenodd"
						/>
					</svg>
					Chat
				</button>

				{/* Friends tab */}
				<button
					onClick={() => { setView("friends"); setMobileView("friends"); }}
					className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium transition active:opacity-60 ${
						mobileView === "friends" ? "text-indigo-400" : "text-gray-500"
					}`}
				>
					<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
						<path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
					</svg>
					Friends
				</button>

				{/* Members tab */}
				<button
					onClick={() => { setView("server"); setMobileView("members"); }}
					className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-3 text-xs font-medium transition active:opacity-60 ${
						mobileView === "members" ? "text-indigo-400" : "text-gray-500"
					}`}
				>
					<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
						<path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 14.094A5.973 5.973 0 004 17v1H1v-1a3 3 0 013.75-2.906z" />
					</svg>
					Members
				</button>
			</nav>

			{/* Modals */}
			<CreateRoomModal
				isOpen={isCreateModalOpen}
				onClose={handleCloseCreateRoom}
				onCreateRoom={handleCreateRoom}
			/>
			<AudioSettingsModal
				isOpen={isSettingsOpen}
				onClose={handleCloseSettings}
				onSave={handleSaveSettings}
				currentSettings={audioSettings}
			/>

			{/* Toasts */}
			<ToastContainer toasts={toasts} onRemove={removeToast} />
		</div>
	);
}
