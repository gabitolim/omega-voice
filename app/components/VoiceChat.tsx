"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import SimplePeer from "simple-peer";

interface Peer {
	id: string;
	peer: SimplePeer.Instance;
	stream?: MediaStream;
}

// Audio level indicator component
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

export default function VoiceChat() {
	const [isConnected, setIsConnected] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [isDeafened, setIsDeafened] = useState(false);
	const [roomId, setRoomId] = useState("");
	const [currentRoom, setCurrentRoom] = useState<string | null>(null);
	const [peers, setPeers] = useState<Peer[]>([]);
	const [status, setStatus] = useState("Disconnected");
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

	// Initialize Socket.io connection
	const connectToServer = (serverUrl: string) => {
		if (socketRef.current) {
			socketRef.current.disconnect();
		}

		const socket = io(serverUrl, {
			transports: ["websocket"],
		});

		socket.on("connect", () => {
			setIsConnected(true);
			setStatus("Connected");
			mySocketIdRef.current = socket.id || null;
			console.log("Connected to server, my ID:", socket.id);
		});

		socket.on("disconnect", () => {
			setIsConnected(false);
			setStatus("Disconnected");
			console.log("Disconnected from server");
		});

		// Handle room joined
		socket.on("room-joined", ({ roomId, users }) => {
			console.log("Joined room:", roomId, "Users:", users);
			setCurrentRoom(roomId);
			setStatus(`In room: ${roomId}`);

			// Only initiate connections to users with higher socket IDs
			// This prevents both sides from initiating simultaneously
			users.forEach((userId: string) => {
				if (mySocketIdRef.current && userId > mySocketIdRef.current) {
					console.log("Initiating connection to:", userId);
					addPeer(userId, true);
				} else {
					console.log("Waiting for", userId, "to initiate");
				}
			});
		});

		// Handle new user joining (for existing room members)
		socket.on("user-joined", ({ userId }) => {
			console.log("New user joined:", userId);
			// Only initiate if our socket ID is lower
			if (mySocketIdRef.current && mySocketIdRef.current < userId) {
				console.log("Initiating connection to new user:", userId);
				addPeer(userId, true);
			} else {
				console.log("Waiting for new user to initiate");
			}
		});

		// Handle receiving signal
		socket.on("signal", ({ userId, signal }) => {
			console.log("Received signal from:", userId);
			const peer = peersRef.current.find((p) => p.id === userId);
			if (peer) {
				// Peer already exists, just signal it
				peer.peer.signal(signal);
			} else {
				// Peer doesn't exist yet, create it as non-initiator with the signal
				console.log("Creating peer for:", userId);
				addPeer(userId, signal);
			}
		});

		// Handle user leaving
		socket.on("user-left", ({ userId }) => {
			console.log("User left:", userId);
			removePeer(userId);
		});

		socketRef.current = socket;
	};

	// Get user media stream
	const getUserMedia = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
				video: false,
			});
			userStreamRef.current = stream;
			startAudioLevelMonitoring(stream);
			return stream;
		} catch (error) {
			console.error("Error accessing microphone:", error);
			setStatus("Microphone access denied");
			return null;
		}
	};

	// Start monitoring audio levels
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

	// Monitor local audio level
	const monitorAudioLevel = () => {
		if (!analyserRef.current) return;

		const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

		const checkLevel = () => {
			if (!analyserRef.current) return;

			analyserRef.current.getByteFrequencyData(dataArray);

			// Calculate average volume
			const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
			const normalizedLevel = Math.min(average / 50, 1); // Normalize to 0-1

			setLocalAudioLevel(normalizedLevel);

			animationFrameRef.current = requestAnimationFrame(checkLevel);
		};

		checkLevel();
	};

	// Start monitoring peer audio
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

	// Monitor peer audio level
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

	// Add peer connection
	const addPeer = (userId: string, incomingSignalOrIsInitiator?: any) => {
		if (!userStreamRef.current) return;

		// Check if peer already exists
		if (peersRef.current.find((p) => p.id === userId)) {
			console.log("Peer already exists for:", userId);
			return;
		}

		// Determine if we're the initiator
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
			// Clean up failed peer
			removePeer(userId);
		});

		peer.on("close", () => {
			console.log("Peer connection closed:", userId);
			removePeer(userId);
		});

		// If we have an incoming signal (not a boolean), use it
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

	// Remove peer
	const removePeer = (userId: string) => {
		const peerObj = peersRef.current.find((p) => p.id === userId);
		if (peerObj) {
			peerObj.peer.destroy();
		}
		peersRef.current = peersRef.current.filter((p) => p.id !== userId);
		setPeers([...peersRef.current]);

		// Clean up peer audio monitoring
		peerAnalysersRef.current.delete(userId);
		setPeerAudioLevels((prev) => {
			const newMap = new Map(prev);
			newMap.delete(userId);
			return newMap;
		});
	};

	// Play incoming audio stream
	const playStream = (stream: MediaStream, userId: string) => {
		const audio = document.getElementById(
			`audio-${userId}`,
		) as HTMLAudioElement;
		if (audio) {
			audio.srcObject = stream;
			audio.play().catch((err) => console.error("Error playing audio:", err));
		}
	};

	// Join room
	const joinRoom = async () => {
		if (!roomId.trim()) {
			setStatus("Please enter a room ID");
			return;
		}

		setStatus("Getting microphone access...");
		const stream = await getUserMedia();
		if (!stream) return;

		setStatus("Joining room...");
		if (socketRef.current) {
			socketRef.current.emit("join-room", { roomId });
		}
	};

	// Leave room
	const leaveRoom = () => {
		if (socketRef.current && currentRoom) {
			socketRef.current.emit("leave-room", { roomId: currentRoom });
			setCurrentRoom(null);
			setStatus("Connected");
		}

		// Cleanup peers
		peersRef.current.forEach((p) => p.peer.destroy());
		peersRef.current = [];
		setPeers([]);

		// Stop user media
		if (userStreamRef.current) {
			userStreamRef.current.getTracks().forEach((track) => track.stop());
			userStreamRef.current = null;
		}

		// Stop audio monitoring
		if (animationFrameRef.current) {
			cancelAnimationFrame(animationFrameRef.current);
		}
		if (audioContextRef.current) {
			audioContextRef.current.close();
		}
		setLocalAudioLevel(0);
	};

	// Toggle mute
	const toggleMute = () => {
		if (userStreamRef.current) {
			userStreamRef.current.getAudioTracks().forEach((track) => {
				track.enabled = isMuted;
			});
			setIsMuted(!isMuted);
		}
	};

	// Toggle deafen
	const toggleDeafen = () => {
		const newDeafenState = !isDeafened;
		setIsDeafened(newDeafenState);

		// Mute all incoming audio
		document.querySelectorAll("audio").forEach((audio) => {
			audio.muted = newDeafenState;
		});

		// Also mute self when deafened
		if (newDeafenState && !isMuted) {
			toggleMute();
		}
	};

	// Initialize on mount
	useEffect(() => {
		// Default server URL - update with your actual server
		connectToServer("http://localhost:3001");

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
	}, []);

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
			<div className="max-w-2xl w-full space-y-6">
				<div className="text-center">
					<h1 className="text-4xl font-bold mb-2">Omega Voice Chat</h1>
					<p className="text-gray-400">Status: {status}</p>
					<div
						className={`inline-block px-3 py-1 rounded-full text-sm mt-2 ${
							isConnected ? "bg-green-600" : "bg-red-600"
						}`}
					>
						{isConnected ? "Connected" : "Disconnected"}
					</div>
				</div>

				{!currentRoom ? (
					<div className="bg-gray-800 rounded-lg p-6 space-y-4">
						<h2 className="text-2xl font-semibold">Join a Room</h2>
						<div className="flex gap-2">
							<input
								type="text"
								value={roomId}
								onChange={(e) => setRoomId(e.target.value)}
								placeholder="Enter room ID"
								className="flex-1 px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
								disabled={!isConnected}
								onKeyPress={(e) => e.key === "Enter" && joinRoom()}
							/>
							<button
								onClick={joinRoom}
								disabled={!isConnected}
								className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg font-semibold transition"
							>
								Join
							</button>
						</div>
					</div>
				) : (
					<div className="bg-gray-800 rounded-lg p-6 space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-2xl font-semibold">Room: {currentRoom}</h2>
							<button
								onClick={leaveRoom}
								className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition"
							>
								Leave Room
							</button>
						</div>

						<div className="flex gap-4 justify-center">
							<button
								onClick={toggleMute}
								className={`px-6 py-3 rounded-lg font-semibold transition ${
									isMuted
										? "bg-red-600 hover:bg-red-700"
										: "bg-gray-600 hover:bg-gray-700"
								}`}
							>
								{isMuted ? "🔇 Unmute" : "🎤 Mute"}
							</button>
							<button
								onClick={toggleDeafen}
								className={`px-6 py-3 rounded-lg font-semibold transition ${
									isDeafened
										? "bg-red-600 hover:bg-red-700"
										: "bg-gray-600 hover:bg-gray-700"
								}`}
							>
								{isDeafened ? "🔇 Undeafen" : "🔊 Deafen"}
							</button>
						</div>

						<div className="mt-4">
							<h3 className="text-xl font-semibold mb-2">
								Participants ({peers.length + 1})
							</h3>
							<ul className="space-y-2">
								<li className="bg-gray-700 px-4 py-3 rounded-lg flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div
											className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
												localAudioLevel > 0.1 && !isMuted
													? "bg-green-500 ring-4 ring-green-500/30"
													: "bg-gray-600"
											}`}
										>
											{isMuted ? "🔇" : "👤"}
										</div>
										<span className="font-medium">
											You {isMuted && "(Muted)"}
										</span>
									</div>
									<AudioLevelIndicator
										level={isMuted ? 0 : localAudioLevel}
										isSpeaking={localAudioLevel > 0.1 && !isMuted}
									/>
								</li>
								{peers.map((peer) => {
									const peerLevel = peerAudioLevels.get(peer.id) || 0;
									const isSpeaking = peerLevel > 0.1;
									return (
										<li
											key={peer.id}
											className="bg-gray-700 px-4 py-3 rounded-lg flex items-center justify-between"
										>
											<div className="flex items-center gap-3">
												<div
													className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
														isSpeaking
															? "bg-green-500 ring-4 ring-green-500/30"
															: "bg-gray-600"
													}`}
												>
													👤
												</div>
												<span className="font-medium">
													User {peer.id.substring(0, 8)}
												</span>
											</div>
											<AudioLevelIndicator
												level={peerLevel}
												isSpeaking={isSpeaking}
											/>
											<audio id={`audio-${peer.id}`} autoPlay />
										</li>
									);
								})}
							</ul>
						</div>
					</div>
				)}

				<div className="bg-gray-800 rounded-lg p-6">
					<h3 className="text-xl font-semibold mb-3">Setup Instructions</h3>
					<ol className="list-decimal list-inside space-y-2 text-gray-300">
						<li>Set up a Socket.io server (see below for server code)</li>
						<li>Update the server URL in this component</li>
						<li>
							Run the server:{" "}
							<code className="bg-gray-700 px-2 py-1 rounded">
								node server.js
							</code>
						</li>
						<li>Make sure microphone permissions are granted</li>
						<li>Share the room ID with others to join the same voice chat</li>
					</ol>
				</div>
			</div>
		</div>
	);
}
