"use client";

import { useState } from "react";

interface CreateRoomModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreateRoom: (roomName: string) => void;
}

export default function CreateRoomModal({
	isOpen,
	onClose,
	onCreateRoom,
}: CreateRoomModalProps) {
	const [roomName, setRoomName] = useState("");

	if (!isOpen) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (roomName.trim()) {
			onCreateRoom(roomName.trim());
			setRoomName("");
			onClose();
		}
	};

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
				<h2 className="text-2xl font-bold text-white mb-4">
					Create Voice Channel
				</h2>

				<form onSubmit={handleSubmit}>
					<div className="mb-4">
						<label className="block text-gray-400 text-sm font-semibold mb-2 uppercase">
							Channel Name
						</label>
						<input
							type="text"
							value={roomName}
							onChange={(e) => setRoomName(e.target.value)}
							placeholder="general-voice"
							className="w-full px-3 py-2 bg-gray-900 text-white rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
							autoFocus
							maxLength={50}
						/>
					</div>

					<div className="flex justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 text-white hover:underline"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!roomName.trim()}
							className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded transition"
						>
							Create Channel
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
