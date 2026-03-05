"use client";

import { useState } from "react";

interface CreateRoomModalProps {
	isOpen: boolean;
	onClose: () => void;
	/** Async — throw to surface an error inside the modal. */
	onCreateRoom: (roomName: string) => Promise<void>;
}

export default function CreateRoomModal({
	isOpen,
	onClose,
	onCreateRoom,
}: CreateRoomModalProps) {
	const [roomName, setRoomName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [errorMsg, setErrorMsg] = useState("");

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = roomName.trim();
		if (!trimmed) return;
		setIsCreating(true);
		setErrorMsg("");
		try {
			await onCreateRoom(trimmed);
			setRoomName("");
			onClose();
		} catch (err: unknown) {
			setErrorMsg(
				err instanceof Error ? err.message : "Failed to create room.",
			);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4">
			<div className="bg-gray-800 rounded-t-2xl sm:rounded-xl p-6 w-full sm:max-w-md border border-gray-700 shadow-2xl">
				<h2 className="text-2xl font-bold text-white mb-1">
					Create Voice Channel
				</h2>
				<p className="text-gray-400 text-sm mb-5">
					Your channel will be visible to everyone on the server.
				</p>

				<form onSubmit={handleSubmit}>
					<div className="mb-4">
						<label className="block text-gray-400 text-xs font-semibold mb-1.5 uppercase tracking-wide">
							Channel Name
						</label>
						<input
							type="text"
							value={roomName}
							onChange={(e) => setRoomName(e.target.value)}
							placeholder="general-voice"
							className="w-full px-3 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-600 transition"
							autoFocus
							maxLength={50}
							disabled={isCreating}
						/>
					</div>

					{errorMsg && (
						<div className="mb-4 flex items-start gap-2 p-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
							<svg
								className="w-4 h-4 mt-0.5 flex-shrink-0"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fillRule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
									clipRule="evenodd"
								/>
							</svg>
							{errorMsg}
						</div>
					)}

					<div className="flex justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							disabled={isCreating}
							className="px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 transition"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!roomName.trim() || isCreating}
							className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition flex items-center gap-2"
						>
							{isCreating && (
								<svg
									className="w-4 h-4 animate-spin"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
									/>
									<path
										className="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
									/>
								</svg>
							)}
							{isCreating ? "Creating..." : "Create Channel"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
