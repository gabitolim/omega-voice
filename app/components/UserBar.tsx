"use client";

import { useState } from "react";

interface UserBarProps {
	username: string;
	isMuted: boolean;
	isDeafened: boolean;
	onToggleMute: () => void;
	onToggleDeafen: () => void;
	onEditUsername: (newUsername: string) => void;
	onOpenSettings?: () => void;
}

export default function UserBar({
	username,
	isMuted,
	isDeafened,
	onToggleMute,
	onToggleDeafen,
	onEditUsername,
	onOpenSettings,
}: UserBarProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [tempUsername, setTempUsername] = useState(username);

	const handleSave = () => {
		if (tempUsername.trim()) {
			onEditUsername(tempUsername.trim());
			setIsEditing(false);
		}
	};

	return (
		<div className="h-14 bg-gray-900 px-2 flex items-center justify-between">
			{/* User Info */}
			<div className="flex items-center gap-2 min-w-0 flex-1">
				<div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
					{username.charAt(0).toUpperCase()}
				</div>
				{isEditing ? (
					<input
						type="text"
						value={tempUsername}
						onChange={(e) => setTempUsername(e.target.value)}
						onBlur={handleSave}
						onKeyPress={(e) => e.key === "Enter" && handleSave()}
						className="bg-gray-800 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"
						autoFocus
					/>
				) : (
					<button
						onClick={() => setIsEditing(true)}
						className="text-white text-sm font-medium hover:text-gray-300 truncate text-left"
						title="Click to edit username"
					>
						{username}
					</button>
				)}
			</div>

			{/* Controls */}
			<div className="flex items-center gap-2">
				<button
					onClick={onToggleMute}
					className={`p-2 rounded hover:bg-gray-800 transition ${
						isMuted ? "text-red-500" : "text-gray-400 hover:text-gray-200"
					}`}
					title={isMuted ? "Unmute" : "Mute"}
				>
					{isMuted ? (
						<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
							<path
								fillRule="evenodd"
								d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
								clipRule="evenodd"
							/>
						</svg>
					) : (
						<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
							<path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" />
						</svg>
					)}
				</button>
				<button
					onClick={onToggleDeafen}
					className={`p-2 rounded hover:bg-gray-800 transition ${
						isDeafened ? "text-red-500" : "text-gray-400 hover:text-gray-200"
					}`}
					title={isDeafened ? "Undeafen" : "Deafen"}
				>
					{isDeafened ? (
						<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
							<path
								fillRule="evenodd"
								d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
								clipRule="evenodd"
							/>
						</svg>
					) : (
						<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
							<path
								fillRule="evenodd"
								d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
								clipRule="evenodd"
							/>
						</svg>
					)}
				</button>
				<button
					onClick={onOpenSettings}
					className="p-2 rounded hover:bg-gray-800 transition text-gray-400 hover:text-gray-200"
					title="Settings"
				>
					<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
						<path
							fillRule="evenodd"
							d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
							clipRule="evenodd"
						/>
					</svg>
				</button>
			</div>
		</div>
	);
}
