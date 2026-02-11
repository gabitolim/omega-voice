"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import Sidebar from "./Sidebar";
import ChannelList from "./ChannelList";
import UserBar from "./UserBar";
import CreateRoomModal from "./CreateRoomModal";
import ToastContainer, { Toast } from "./ToastContainer";
import AudioSettingsModal, { AudioSettings } from "./AudioSettingsModal";
import ChatPanel, { ChatMessage } from "./ChatPanel";

interface Peer {
	id: string;
	peer: SimplePeer.Instance;
	stream?: MediaStream;
	username?: string;
}

interface VoiceUser {
	socketId: string;
	username: string;
}

interface VoiceRoom {
	id: string;
	name: string;
	userCount: number;
	users?: VoiceUser[];
}

export default function DiscordLayout() {
	// UI State
	const [username, setUsername] = useState("");
	const [isUsernameSet, setIsUsernameSet] = useState(false);
	const [servers] = useState([{ id: "1", name: "Omega Server" }]);
	const [currentServer] = useState("1");
	const [rooms, setRooms] = useState<VoiceRoom[]>([]);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [toasts, setToasts] = useState<Toast[]>([]);
	const [messages, setMessages] = useState<ChatMessage[]>([]);

	// Voice Chat State
	const [isConnected, setIsConnected] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [isDeafened, setIsDeafened] = useState(false);
	const [currentRoom, setCurrentRoom] = useState<string | null>(null);
	const [peers, setPeers] = useState<Peer[]>([]);
	const [localAudioLevel, setLocalAudioLevel] = useState(0);
	const [peerAudioLevels, setPeerAudioLevels] = useState<Map<string, number>>(
		new Map(),
	);

	const socketRef = useRef<Socket | null>(null);
	const mySocketIdRef = useRef<string | null>(null);
	const userStreamRef = useRef<MediaStream | null>(null);
	const peersRef = useRef<Peer[]>([]);
	const audioContextRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const peerAnalysersRef = useRef<Map<string, AnalyserNode>>(new Map());
	const reconnectAttemptsRef = useRef(0);
	const isPushToTalkActiveRef = useRef(false);

	// Audio Settings
	const [audioSettings, setAudioSettings] = useState<AudioSettings>({
		inputDeviceId: "",
		outputDeviceId: "",
		inputVolume: 1.0,
		outputVolume: 1.0,
		vadThreshold: 0.3,
		pushToTalkEnabled: false,
		pushToTalkKey: "Space",
	});

	// Load username and rooms from localStorage
	useEffect(() => {
		const savedUsername = localStorage.getItem("omega-username");
		if (savedUsername) {
			setUsername(savedUsername);
			setIsUsernameSet(true);
		}

		const savedRooms = localStorage.getItem("omega-rooms");
		if (savedRooms) {
			try {
				const parsedRooms = JSON.parse(savedRooms) as VoiceRoom[];
				setRooms(parsedRooms.map((r) => ({ ...r, userCount: 0, users: [] })));
			} catch (e) {
				console.error("Error loading rooms:", e);
			}
		}

		// Load audio settings
		const savedSettings = localStorage.getItem("omega-audio-settings");
		if (savedSettings) {
			try {
				setAudioSettings(JSON.parse(savedSettings));
			} catch (e) {
				console.error("Error loading audio settings:", e);
			}
		}
	}, []);

	// Toast notification helper
	const showToast = (
		message: string,
		type: "success" | "error" | "info" | "warning" = "info",
		duration = 3000,
	) => {
		const id = `${Date.now()}-${Math.random()}`;
		setToasts((prev) => [...prev, { id, message, type, duration }]);
	};

	const removeToast = (id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	};

	// Initialize Socket.io connection
	useEffect(() => {
		if (!isUsernameSet) return;

		const connectSocket = () => {
			const socket = io("http://localhost:3001", {
				transports: ["websocket"],
				reconnection: true,
				reconnectionDelay: 1000,
				reconnectionDelayMax: 5000,
				reconnectionAttempts: 10,
			});

			socket.on("connect", () => {
				setIsConnected(true);
				mySocketIdRef.current = socket.id || null;
				reconnectAttemptsRef.current = 0;
				console.log("Connected to server, my ID:", socket.id);
				showToast("Connected to server", "success");
				// Send username to server
				socket.emit("set-username", { username });
			});

			socket.on("disconnect", (reason) => {
				setIsConnected(false);
				console.log("Disconnected from server:", reason);
				showToast("Disconnected from server", "error");
			});

			socket.on("connect_error", (error) => {
				console.error("Connection error:", error);
				reconnectAttemptsRef.current++;
				if (reconnectAttemptsRef.current <= 3) {
					showToast(
						`Connection error, retrying... (${reconnectAttemptsRef.current}/3)`,
						"warning",
					);
				}
			});

			socket.on("reconnect", (attemptNumber) => {
				console.log("Reconnected after", attemptNumber, "attempts");
				showToast("Reconnected to server", "success");

				// Rejoin room if we were in one
				if (currentRoom) {
					socket.emit("join-room", { roomId: currentRoom });
				}
			});

			// Handle rooms list from server
			socket.on("rooms-list", (roomsList: VoiceRoom[]) => {
				console.log("Received rooms list:", roomsList);
				setRooms((prev) => {
					// Preserve existing user data when updating rooms
					const updated = roomsList.map((newRoom) => {
						const existingRoom = prev.find((r) => r.id === newRoom.id);
						return {
							...newRoom,
							userCount: existingRoom?.userCount || 0,
							users: existingRoom?.users || [],
						};
					});
					return updated;
				});
				// Save to localStorage (without users since they're dynamic)
				localStorage.setItem("omega-rooms", JSON.stringify(roomsList));
			});

			// Handle new room created
			socket.on("room-created", (newRoom: { id: string; name: string }) => {
				console.log("New room created:", newRoom);
				setRooms((prev) => {
					// Check if room already exists
					if (prev.find((r) => r.id === newRoom.id)) {
						return prev;
					}
					const updated = [...prev, { ...newRoom, userCount: 0, users: [] }];
					localStorage.setItem(
						"omega-rooms",
						JSON.stringify(updated.map(({ id, name }) => ({ id, name }))),
					);
					return updated;
				});
			});

			// Handle room user updates
			socket.on(
				"room-users-update",
				({ roomId, users }: { roomId: string; users: VoiceUser[] }) => {
					console.log(`🔔 Room ${roomId} users updated from server:`, users);
					setRooms((prev) => {
						console.log(`📋 Previous rooms state:`, prev);
						const updated = prev.map((room) => {
							if (room.id === roomId) {
								console.log(
									`✏️ Updating room ${roomId} with ${users.length} users`,
								);
								return { ...room, userCount: users.length, users };
							}
							return room;
						});
						console.log(`✅ New rooms state:`, updated);
						return updated;
					});
				},
			);

			// Handle speaking state updates from other users
			socket.on(
				"speaking-state",
				({ userId, isSpeaking }: { userId: string; isSpeaking: boolean }) => {
					setRooms((prev) =>
						prev.map((room) => ({
							...room,
							users: room.users?.map((user) =>
								user.socketId === userId ? { ...user, isSpeaking } : user,
							),
						})),
					);
				},
			);

			// Handle chat messages
			socket.on("chat-message", (message: ChatMessage) => {
				setMessages((prev) => [...prev, message]);
			});

			// Handle chat history when joining a room
			socket.on(
				"chat-history",
				({
					messages: historyMessages,
				}: {
					roomId: string;
					messages: ChatMessage[];
				}) => {
					setMessages(historyMessages);
				},
			);

			socket.on("room-joined", ({ roomId, users }) => {
				console.log("✅ Joined room:", roomId, "Users:", users);
				setCurrentRoom(roomId);

				users.forEach((userId: string) => {
					if (mySocketIdRef.current && userId > mySocketIdRef.current) {
						console.log("🤝 Initiating connection to:", userId);
						// @ts-expect-error - function is defined later via closure
						addPeer(userId, true);
					} else {
						console.log("⏳ Waiting for", userId, "to initiate");
					}
				});
			});

			socket.on("user-joined", ({ userId, username: peerUsername }) => {
				console.log("New user joined:", userId, peerUsername);
				showToast(`${peerUsername || "User"} joined the channel`, "info");
				if (mySocketIdRef.current && mySocketIdRef.current < userId) {
					console.log("Initiating connection to new user:", userId);
					// @ts-expect-error - function is defined later via closure
					addPeer(userId, true);
				} else {
					console.log("Waiting for new user to initiate");
				}
			});

			socket.on("signal", ({ userId, signal }) => {
				console.log("Received signal from:", userId);
				const peer = peersRef.current.find((p) => p.id === userId);
				if (peer) {
					peer.peer.signal(signal);
				} else {
					console.log("Creating peer for:", userId);
					// @ts-expect-error - function is defined later via closure
					addPeer(userId, signal);
				}
			});

			socket.on("user-left", ({ userId }) => {
				console.log("User left:", userId);
				showToast("User left the channel", "info");
				// @ts-expect-error - function is defined later via closure
				removePeer(userId);
			});

			socketRef.current = socket;
		};

		connectSocket();

		return () => {
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
			if (userStreamRef.current) {
				userStreamRef.current.getTracks().forEach((track) => track.stop());
			}
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
			peersRef.current.forEach((p) => p.peer.destroy());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isUsernameSet, username]);

	// Push-to-Talk keyboard listener
	useEffect(() => {
		if (!audioSettings.pushToTalkEnabled || !currentRoom) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === audioSettings.pushToTalkKey && !e.repeat) {
				isPushToTalkActiveRef.current = true;
				if (userStreamRef.current) {
					userStreamRef.current.getAudioTracks().forEach((track) => {
						track.enabled = true;
					});
					setIsMuted(false);
				}
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.code === audioSettings.pushToTalkKey) {
				isPushToTalkActiveRef.current = false;
				if (userStreamRef.current) {
					userStreamRef.current.getAudioTracks().forEach((track) => {
						track.enabled = false;
					});
					setIsMuted(true);
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);

		// Start with muted if push-to-talk is enabled
		if (userStreamRef.current) {
			userStreamRef.current.getAudioTracks().forEach((track) => {
				track.enabled = false;
			});
			setIsMuted(true);
		}

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, [
		audioSettings.pushToTalkEnabled,
		audioSettings.pushToTalkKey,
		currentRoom,
	]);

	// Broadcast speaking state to server
	useEffect(() => {
		if (!socketRef.current || !currentRoom) return;

		const isSpeaking = localAudioLevel > 0.1 && !isMuted;
		socketRef.current.emit("speaking-state", {
			roomId: currentRoom,
			isSpeaking,
		});
	}, [localAudioLevel, isMuted, currentRoom]);

	const getUserMedia = async () => {
		try {
			const constraints: MediaStreamConstraints = {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
					...(audioSettings.inputDeviceId && {
						deviceId: { exact: audioSettings.inputDeviceId },
					}),
				},
				video: false,
			};

			const stream = await navigator.mediaDevices.getUserMedia(constraints);

			// Apply input volume
			if (audioSettings.inputVolume !== 1.0) {
				const audioContext = new AudioContext();
				const source = audioContext.createMediaStreamSource(stream);
				const gainNode = audioContext.createGain();
				gainNode.gain.value = audioSettings.inputVolume;

				const destination = audioContext.createMediaStreamDestination();
				source.connect(gainNode);
				gainNode.connect(destination);

				userStreamRef.current = destination.stream;
				startAudioLevelMonitoring(destination.stream);
			} else {
				userStreamRef.current = stream;
				startAudioLevelMonitoring(stream);
			}

			return userStreamRef.current;
		} catch (error) {
			console.error("Error accessing microphone:", error);
			showToast("Error accessing microphone", "error");
			return null;
		}
	};

	const startAudioLevelMonitoring = (stream: MediaStream) => {
		try {
			const audioContext = new AudioContext();
			const analyser = audioContext.createAnalyser();
			const source = audioContext.createMediaStreamSource(stream);

			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.8;
			source.connect(analyser);

			audioContextRef.current = audioContext;
			analyserRef.current = analyser;

			monitorAudioLevel();
		} catch (error) {
			console.error("Error setting up audio monitoring:", error);
		}
	};

	const monitorAudioLevel = () => {
		if (!analyserRef.current) return;

		const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

		const checkLevel = () => {
			if (!analyserRef.current) return;

			analyserRef.current.getByteFrequencyData(dataArray);
			const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
			const normalizedLevel = Math.min(average / 50, 1);

			setLocalAudioLevel(normalizedLevel);
			animationFrameRef.current = requestAnimationFrame(checkLevel);
		};

		checkLevel();
	};

	const startPeerAudioMonitoring = (stream: MediaStream, userId: string) => {
		try {
			const audioContext = new AudioContext();
			const analyser = audioContext.createAnalyser();
			const source = audioContext.createMediaStreamSource(stream);

			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.8;
			source.connect(analyser);

			peerAnalysersRef.current.set(userId, analyser);
			monitorPeerAudioLevel(userId, analyser);
		} catch (error) {
			console.error(
				`Error setting up peer audio monitoring for ${userId}:`,
				error,
			);
		}
	};

	const monitorPeerAudioLevel = (userId: string, analyser: AnalyserNode) => {
		const dataArray = new Uint8Array(analyser.frequencyBinCount);

		const checkLevel = () => {
			if (!peerAnalysersRef.current.has(userId)) return;

			analyser.getByteFrequencyData(dataArray);
			const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
			const normalizedLevel = Math.min(average / 50, 1);

			setPeerAudioLevels((prev) => new Map(prev).set(userId, normalizedLevel));
			requestAnimationFrame(checkLevel);
		};

		checkLevel();
	};

	const addPeer = (userId: string, incomingSignalOrIsInitiator?: any) => {
		if (!userStreamRef.current) return;

		if (peersRef.current.find((p) => p.id === userId)) {
			console.log("Peer already exists for:", userId);
			return;
		}

		const isInitiator =
			typeof incomingSignalOrIsInitiator === "boolean"
				? incomingSignalOrIsInitiator
				: !incomingSignalOrIsInitiator;

		console.log(`Creating peer for ${userId}, initiator: ${isInitiator}`);

		const peer = new SimplePeer({
			initiator: isInitiator,
			trickle: false,
			stream: userStreamRef.current,
		});

		peer.on("signal", (signal) => {
			if (socketRef.current) {
				socketRef.current.emit("signal", {
					userId,
					signal,
				});
			}
		});

		peer.on("stream", (stream) => {
			console.log("Received stream from:", userId);
			const peerObj = peersRef.current.find((p) => p.id === userId);
			if (peerObj) {
				peerObj.stream = stream;
				setPeers([...peersRef.current]);
				playStream(stream, userId);
				startPeerAudioMonitoring(stream, userId);
			}
		});

		peer.on("error", (err) => {
			console.error(`Peer error with ${userId}:`, err);
			removePeer(userId);
		});

		peer.on("close", () => {
			console.log("Peer connection closed:", userId);
			removePeer(userId);
		});

		if (
			incomingSignalOrIsInitiator &&
			typeof incomingSignalOrIsInitiator !== "boolean"
		) {
			try {
				peer.signal(incomingSignalOrIsInitiator);
			} catch (err) {
				console.error("Error signaling peer:", err);
				removePeer(userId);
				return;
			}
		}

		const peerObj: Peer = { id: userId, peer };
		peersRef.current.push(peerObj);
		setPeers([...peersRef.current]);
	};

	const removePeer = (userId: string) => {
		const peerObj = peersRef.current.find((p) => p.id === userId);
		if (peerObj) {
			peerObj.peer.destroy();
		}
		peersRef.current = peersRef.current.filter((p) => p.id !== userId);
		setPeers([...peersRef.current]);

		peerAnalysersRef.current.delete(userId);
		setPeerAudioLevels((prev) => {
			const newMap = new Map(prev);
			newMap.delete(userId);
			return newMap;
		});
	};

	const playStream = (stream: MediaStream, userId: string) => {
		const audio = document.getElementById(
			`audio-${userId}`,
		) as HTMLAudioElement;
		if (audio) {
			audio.srcObject = stream;
			audio.volume = audioSettings.outputVolume;
			audio.play().catch((err) => console.error("Error playing audio:", err));
		}
	};

	const joinRoom = async (roomId: string) => {
		if (currentRoom === roomId) return;

		if (currentRoom) {
			leaveRoom();
		}

		const stream = await getUserMedia();
		if (!stream) return;

		if (socketRef.current) {
			socketRef.current.emit("join-room", { roomId });
		}
	};

	const leaveRoom = () => {
		if (socketRef.current && currentRoom) {
			socketRef.current.emit("leave-room", { roomId: currentRoom });
			setCurrentRoom(null);
			setMessages([]); // Clear messages when leaving room
		}

		peersRef.current.forEach((p) => p.peer.destroy());
		peersRef.current = [];
		setPeers([]);

		if (userStreamRef.current) {
			userStreamRef.current.getTracks().forEach((track) => track.stop());
			userStreamRef.current = null;
		}

		if (animationFrameRef.current) {
			cancelAnimationFrame(animationFrameRef.current);
		}
		if (audioContextRef.current) {
			audioContextRef.current.close();
		}
		setLocalAudioLevel(0);
	};

	const toggleMute = () => {
		if (userStreamRef.current) {
			userStreamRef.current.getAudioTracks().forEach((track) => {
				track.enabled = isMuted;
			});
			setIsMuted(!isMuted);
		}
	};

	const toggleDeafen = () => {
		const newDeafenState = !isDeafened;
		setIsDeafened(newDeafenState);

		document.querySelectorAll("audio").forEach((audio) => {
			audio.muted = newDeafenState;
		});

		if (newDeafenState && !isMuted) {
			toggleMute();
		}
	};

	const handleEditUsername = (newUsername: string) => {
		setUsername(newUsername);
		localStorage.setItem("omega-username", newUsername);
	};

	const handleCreateRoom = (roomName: string) => {
		const roomId = roomName.toLowerCase().replace(/\s+/g, "-");
		if (socketRef.current) {
			socketRef.current.emit("create-room", { roomId, roomName });
		}
	};

	const handleSendMessage = (messageText: string) => {
		if (socketRef.current && currentRoom) {
			socketRef.current.emit("chat-message", {
				roomId: currentRoom,
				message: messageText,
			});
		}
	};

	const handleSaveSettings = (newSettings: AudioSettings) => {
		setAudioSettings(newSettings);
		localStorage.setItem("omega-audio-settings", JSON.stringify(newSettings));
		showToast("Settings saved", "success");

		// Reapply volume to existing audio elements
		document.querySelectorAll("audio").forEach((audio) => {
			audio.volume = newSettings.outputVolume;
		});

		// If in a call, restart media stream with new settings
		if (currentRoom && userStreamRef.current) {
			const wasEnabled = userStreamRef.current.getAudioTracks()[0]?.enabled;
			userStreamRef.current.getTracks().forEach((track) => track.stop());
			getUserMedia().then((stream) => {
				if (stream && !wasEnabled) {
					stream.getAudioTracks().forEach((track) => {
						track.enabled = false;
					});
				}
			});
		}
	};

	const AudioLevelIndicator = ({
		level,
		isSpeaking,
	}: {
		level: number;
		isSpeaking: boolean;
	}) => {
		const bars = 5;
		const activeBars = Math.ceil(level * bars);

		return (
			<div className="flex gap-1 items-end h-6">
				{Array.from({ length: bars }).map((_, i) => (
					<div
						key={i}
						className={`w-1 transition-all duration-75 rounded-sm ${
							i < activeBars
								? isSpeaking
									? "bg-green-500"
									: "bg-gray-500"
								: "bg-gray-700"
						}`}
						style={{
							height: `${((i + 1) / bars) * 100}%`,
						}}
					/>
				))}
			</div>
		);
	};

	// Username setup screen
	if (!isUsernameSet) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-900">
				<div className="bg-gray-800 rounded-lg p-8 max-w-md w-full">
					<h1 className="text-3xl font-bold text-white mb-2">
						Welcome to Omega
					</h1>
					<p className="text-gray-400 mb-6">Choose a username to get started</p>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							if (username.trim()) {
								localStorage.setItem("omega-username", username.trim());
								setIsUsernameSet(true);
							}
						}}
					>
						<input
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							placeholder="Enter your username"
							className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
							autoFocus
							maxLength={32}
						/>
						<button
							type="submit"
							disabled={!username.trim()}
							className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition"
						>
							Continue
						</button>
					</form>
				</div>
			</div>
		);
	}

	// Main Discord-like layout
	return (
		<div className="flex h-screen bg-gray-700 text-white">
			{/* Sidebar */}
			<Sidebar
				servers={servers}
				currentServer={currentServer}
				onServerClick={() => {}}
				onHomeClick={() => {}}
			/>

			{/* Channel List */}
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
				/>
			</div>

			{/* Main Content Area */}
			<div className="flex-1 flex flex-col bg-gray-700">
				{/* Top Bar */}
				<div className="h-12 px-4 border-b border-gray-900 flex items-center">
					<svg
						className="w-5 h-5 text-gray-400 mr-2"
						fill="currentColor"
						viewBox="0 0 20 20"
					>
						<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
					</svg>
					<h2 className="font-semibold text-white">
						{currentRoom
							? rooms.find((r) => r.id === currentRoom)?.name || currentRoom
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

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-4">
					{!isConnected ? (
						<div className="flex items-center justify-center h-full">
							<div className="text-center text-gray-400">
								<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
								<p>Connecting to server...</p>
							</div>
						</div>
					) : !currentRoom ? (
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
						<div className="max-w-4xl mx-auto">
							<h3 className="text-xl font-semibold mb-6 text-white">
								Voice Connected — {peers.length + 1} participant
								{peers.length !== 0 && "s"}
							</h3>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								{/* Current User */}
								<div className="bg-gray-800 rounded-xl p-4 border-2 border-indigo-500/30 hover:border-indigo-500/50 transition-all">
									<div className="flex items-center gap-4">
										{/* Avatar with speaking ring */}
										<div className="relative">
											<div
												className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
													localAudioLevel > 0.1 && !isMuted
														? "bg-green-500 ring-4 ring-green-400 shadow-lg shadow-green-500/50 scale-105"
														: "bg-gray-600"
												}`}
												style={{
													animation:
														localAudioLevel > 0.1 && !isMuted
															? "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite"
															: "none",
												}}
											>
												{username.charAt(0).toUpperCase()}
											</div>
											{/* Status icons */}
											<div className="absolute -bottom-1 -right-1 flex gap-1">
												{isMuted && (
													<div
														className="bg-red-500 rounded-full p-1.5"
														title="Muted"
													>
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
													<div
														className="bg-gray-900 rounded-full p-1.5"
														title="Deafened"
													>
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
												<span className="text-xs px-2 py-0.5 bg-indigo-500 text-white rounded-full font-medium">
													YOU
												</span>
											</div>
											<AudioLevelIndicator
												level={isMuted ? 0 : localAudioLevel}
												isSpeaking={localAudioLevel > 0.1 && !isMuted}
											/>
										</div>
									</div>
								</div>

								{/* Peers */}
								{peers.map((peer) => {
									const peerLevel = peerAudioLevels.get(peer.id) || 0;
									const isSpeaking = peerLevel > 0.1;
									const peerUsername =
										peer.username || `User ${peer.id.substring(0, 8)}`;
									return (
										<div
											key={peer.id}
											className="bg-gray-800 rounded-xl p-4 border-2 border-gray-700 hover:border-gray-600 transition-all"
										>
											<div className="flex items-center gap-4">
												{/* Avatar with speaking ring */}
												<div className="relative flex-shrink-0">
													<div
														className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-200 ${
															isSpeaking
																? "bg-green-500 ring-4 ring-green-400 shadow-lg shadow-green-500/50 scale-105"
																: "bg-gray-600"
														}`}
														style={{
															animation: isSpeaking
																? "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite"
																: "none",
														}}
													>
														{peerUsername.charAt(0).toUpperCase()}
													</div>
												</div>
												{/* User info */}
												<div className="flex-1 min-w-0">
													<div className="font-semibold text-white truncate mb-1">
														{peerUsername}
													</div>
													<AudioLevelIndicator
														level={peerLevel}
														isSpeaking={isSpeaking}
													/>
												</div>
											</div>
											<audio id={`audio-${peer.id}`} autoPlay />
										</div>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Chat Panel - Only show when in a room */}
			{currentRoom && (
				<ChatPanel
					roomName={
						rooms.find((r) => r.id === currentRoom)?.name || currentRoom
					}
					messages={messages}
					currentUsername={username}
					onSendMessage={handleSendMessage}
				/>
			)}

			{/* Create Room Modal */}
			<CreateRoomModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onCreateRoom={handleCreateRoom}
			/>

			{/* Audio Settings Modal */}
			<AudioSettingsModal
				isOpen={isSettingsOpen}
				onClose={() => setIsSettingsOpen(false)}
				onSave={handleSaveSettings}
				currentSettings={audioSettings}
			/>

			{/* Toast Notifications */}
			<ToastContainer toasts={toasts} onRemove={removeToast} />
		</div>
	);
}
