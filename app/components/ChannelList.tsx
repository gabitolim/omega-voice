"use client";

import { useState, useEffect } from "react";

interface VoiceUser {
	socketId: string;
	username: string;
	isSpeaking?: boolean;
}

interface VoiceRoom {
	id: string;
	name: string;
	userCount: number;
	users?: VoiceUser[];
}

interface ChannelListProps {
	serverName: string;
	rooms: VoiceRoom[];
	currentRoom: string | null;
	onRoomClick: (roomId: string) => void;
	onCreateRoom: () => void;
}

export default function ChannelList({
	serverName,
	rooms,
	currentRoom,
	onRoomClick,
	onCreateRoom,
}: ChannelListProps) {
	const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

	// Debug: Log rooms when they change
	useEffect(() => {
		console.log("📱 ChannelList - Rooms updated:", rooms);
		rooms.forEach((room) => {
			if (room.users && room.users.length > 0) {
				console.log(
					`  📍 Room ${room.name} has ${room.users.length} users:`,
					room.users,
				);
			}
		});
	}, [rooms]);

	const toggleRoomExpansion = (roomId: string) => {
		const newExpanded = new Set(expandedRooms);
		if (newExpanded.has(roomId)) {
			newExpanded.delete(roomId);
		} else {
			newExpanded.add(roomId);
		}
		setExpandedRooms(newExpanded);
	};

	return (
		<div className="w-80 h-full bg-gray-800 flex flex-col">
			{/* Server Header */}
			<div className="h-12 px-4 flex items-center border-b border-gray-900 shadow-md">
				<h2 className="font-semibold text-white truncate">{serverName}</h2>
			</div>

			{/* Channels */}
			<div className="flex-1 overflow-y-auto">
				<div className="p-2">
					{/* Voice Channels Header */}
					<div className="flex items-center justify-between px-2 py-2">
						<div className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
							<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
								<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
							</svg>
							Voice Channels
						</div>
						<button
							onClick={onCreateRoom}
							className="text-gray-400 hover:text-gray-200 transition"
							title="Create Channel"
						>
							<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
								<path
									fillRule="evenodd"
									d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</div>

					{/* Room List */}
					<div className="space-y-0.5">
						{rooms.length === 0 ? (
							<div className="px-2 py-4 text-center text-gray-500 text-sm">
								No voice channels yet
							</div>
						) : (
							rooms.map((room) => {
								const isExpanded = expandedRooms.has(room.id);
								const hasUsers = room.users && room.users.length > 0;

								return (
									<div key={room.id}>
										{/* Channel Button */}
										<div className="relative group">
											<button
												onClick={() => onRoomClick(room.id)}
												className={`w-full px-2 py-1.5 rounded flex items-center gap-2 transition ${
													currentRoom === room.id
														? "bg-gray-700 text-white"
														: "text-gray-400 hover:bg-gray-700 hover:text-gray-200"
												}`}
											>
												<svg
													className="w-5 h-5 flex-shrink-0"
													fill="currentColor"
													viewBox="0 0 20 20"
												>
													<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
												</svg>
												<span className="font-medium truncate flex-1 text-left">
													{room.name}
												</span>
												{room.userCount > 0 && (
													<span className="text-xs text-gray-400">
														{room.userCount}
													</span>
												)}
											</button>
											{hasUsers && (
												<div
													onClick={() => toggleRoomExpansion(room.id)}
													className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-600 rounded transition cursor-pointer"
												>
													<svg
														className={`w-3 h-3 transition-transform ${
															isExpanded ? "rotate-0" : "-rotate-90"
														}`}
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path
															fillRule="evenodd"
															d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
															clipRule="evenodd"
														/>
													</svg>
												</div>
											)}
										</div>

										{/* Users in Channel */}
										{hasUsers && isExpanded && (
											<div className="ml-4 mt-1 space-y-1">
												{room.users?.map((user) => (
													<div
														key={user.socketId}
														className="px-2 py-1 flex items-center gap-2 text-gray-400 hover:bg-gray-700/50 rounded text-sm transition-colors"
													>
														<div className="relative">
															<div
																className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200 ${
																	user.isSpeaking
																		? "bg-green-500 ring-2 ring-green-400"
																		: "bg-gray-600"
																}`}
															>
																{user.username.charAt(0).toUpperCase()}
															</div>
														</div>
														<span
															className={`truncate transition-colors ${
																user.isSpeaking
																	? "text-green-400 font-medium"
																	: ""
															}`}
														>
															{user.username}
														</span>
													</div>
												))}
											</div>
										)}
									</div>
								);
							})
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
