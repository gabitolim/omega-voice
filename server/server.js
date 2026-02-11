// Simple Socket.io Server for Voice Chat
// This server handles signaling for WebRTC connections

const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// Enable CORS for all origins (adjust for production)
app.use(cors());

const io = socketIO(server, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"],
	},
});

// Store rooms and their users
const rooms = new Map(); // roomId -> Set of user objects { socketId, username }
const userSockets = new Map(); // socketId -> { username, currentRoom }
const availableRooms = new Map(); // roomId -> { id, name }
const chatHistory = new Map(); // roomId -> array of messages

// Initialize default rooms
availableRooms.set("general", { id: "general", name: "General" });
availableRooms.set("gaming", { id: "gaming", name: "Gaming" });

io.on("connection", (socket) => {
	console.log("User connected:", socket.id);

	// Send available rooms to new user
	socket.emit("rooms-list", Array.from(availableRooms.values()));

	// Set username
	socket.on("set-username", ({ username }) => {
		userSockets.set(socket.id, { username, currentRoom: null });
		console.log(`User ${socket.id} set username: ${username}`);
	});

	// Create a new room
	socket.on("create-room", ({ roomId, roomName }) => {
		if (!availableRooms.has(roomId)) {
			availableRooms.set(roomId, { id: roomId, name: roomName });
			io.emit("room-created", { id: roomId, name: roomName });
			console.log(`Room created: ${roomName} (${roomId})`);
		}
	});

	// Join a room
	socket.on("join-room", ({ roomId }) => {
		console.log(`\n🚪 User ${socket.id} joining room: ${roomId}`);

		const userInfo = userSockets.get(socket.id);
		if (!userInfo) {
			console.log("❌ User info not found for", socket.id);
			return;
		}

		console.log(`👤 User info: ${userInfo.username}`);

		// Leave current room if in one
		if (userInfo.currentRoom && userInfo.currentRoom !== roomId) {
			console.log(`🚪 User was in ${userInfo.currentRoom}, leaving first`);
			leaveRoom(socket, userInfo.currentRoom);
		}

		// Get existing users in the room
		const roomUsers = rooms.get(roomId) || new Set();
		console.log(
			`📋 Room ${roomId} currently has ${roomUsers.size} users:`,
			Array.from(roomUsers).map((u) => u.username),
		);

		const existingUserIds = Array.from(roomUsers).map((u) => u.socketId);

		// Add current user to room
		socket.join(roomId);
		roomUsers.add({ socketId: socket.id, username: userInfo.username });
		rooms.set(roomId, roomUsers);
		userInfo.currentRoom = roomId;
		userSockets.set(socket.id, userInfo);

		console.log(
			`✅ After adding, room ${roomId} has ${roomUsers.size} users:`,
			Array.from(roomUsers).map((u) => u.username),
		);

		// Notify the user they've joined
		socket.emit("room-joined", {
			roomId,
			users: existingUserIds,
		});

		// Send chat history to the joining user
		const history = chatHistory.get(roomId) || [];
		socket.emit("chat-history", {
			roomId,
			messages: history,
		});

		// Notify existing users about the new user
		socket.to(roomId).emit("user-joined", {
			userId: socket.id,
			username: userInfo.username,
		});

		// Broadcast updated room user list to everyone
		broadcastRoomUsers(roomId);
	});

	// Handle WebRTC signaling
	socket.on("signal", ({ userId, signal }) => {
		console.log(`Relaying signal from ${socket.id} to ${userId}`);
		io.to(userId).emit("signal", {
			userId: socket.id,
			signal,
		});
	});

	// Leave a room
	socket.on("leave-room", ({ roomId }) => {
		console.log(`User ${socket.id} leaving room: ${roomId}`);
		leaveRoom(socket, roomId);
	});

	// Handle speaking state updates
	socket.on("speaking-state", ({ roomId, isSpeaking }) => {
		const userInfo = userSockets.get(socket.id);
		if (userInfo && userInfo.currentRoom === roomId) {
			// Broadcast to all users in the room except sender
			socket.to(roomId).emit("speaking-state", {
				userId: socket.id,
				isSpeaking,
			});
		}
	});

	// Handle chat messages
	socket.on("chat-message", ({ roomId, message }) => {
		const userInfo = userSockets.get(socket.id);
		if (userInfo && userInfo.currentRoom === roomId) {
			const chatMessage = {
				id: `${socket.id}-${Date.now()}`,
				userId: socket.id,
				username: userInfo.username,
				message,
				timestamp: Date.now(),
			};

			// Store in history
			if (!chatHistory.has(roomId)) {
				chatHistory.set(roomId, []);
			}
			chatHistory.get(roomId).push(chatMessage);

			// Broadcast to all users in the room (including sender)
			io.to(roomId).emit("chat-message", chatMessage);
			console.log(
				`💬 Chat message in ${roomId} from ${userInfo.username}: ${message}`,
			);
		}
	});

	// Handle disconnection
	socket.on("disconnect", () => {
		console.log("User disconnected:", socket.id);

		const userInfo = userSockets.get(socket.id);
		if (userInfo && userInfo.currentRoom) {
			leaveRoom(socket, userInfo.currentRoom);
		}
		userSockets.delete(socket.id);
	});
});

function leaveRoom(socket, roomId) {
	const roomUsers = rooms.get(roomId);
	if (roomUsers) {
		// Remove user from room
		const userToRemove = Array.from(roomUsers).find(
			(u) => u.socketId === socket.id,
		);
		if (userToRemove) {
			roomUsers.delete(userToRemove);
		}

		if (roomUsers.size === 0) {
			rooms.delete(roomId);
			console.log(`Room ${roomId} is now empty`);
		} else {
			rooms.set(roomId, roomUsers);
		}
	}

	socket.leave(roomId);

	// Notify other users
	socket.to(roomId).emit("user-left", {
		userId: socket.id,
	});

	// Update user's current room
	const userInfo = userSockets.get(socket.id);
	if (userInfo) {
		userInfo.currentRoom = null;
		userSockets.set(socket.id, userInfo);
	}

	// Broadcast updated room user list
	broadcastRoomUsers(roomId);
}

function broadcastRoomUsers(roomId) {
	const roomUsers = rooms.get(roomId) || new Set();
	const userList = Array.from(roomUsers).map((u) => ({
		socketId: u.socketId,
		username: u.username,
	}));

	console.log(
		`📢 Broadcasting room ${roomId} with ${userList.length} users:`,
		userList.map((u) => `${u.username}(${u.socketId.slice(0, 5)})`),
	);

	io.emit("room-users-update", {
		roomId,
		users: userList,
	});
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
	console.log(`Socket.io server running on port ${PORT}`);
	console.log(`WebRTC signaling server ready`);
});
