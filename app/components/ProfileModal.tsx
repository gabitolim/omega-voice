/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";

interface ProfileModalProps {
	isOpen: boolean;
	onClose: () => void;
	userId: string;
	currentDisplayName: string;
	currentAvatarUrl: string | null;
	/** Read-only tag, e.g. "gabito" */
	tag?: string;
	/** Read-only discriminator, e.g. "0042" */
	discriminator?: string;
	onUpdated: (displayName: string, avatarUrl: string | null) => void;
}

export default function ProfileModal({
	isOpen,
	onClose,
	userId,
	currentDisplayName,
	currentAvatarUrl,
	tag,
	discriminator,
	onUpdated,
}: ProfileModalProps) {
	const [displayName, setDisplayName] = useState(currentDisplayName);
	const [avatarUrl, setAvatarUrl] = useState<string | null>(currentAvatarUrl);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(
		currentAvatarUrl,
	);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Sync props when modal reopens
	useEffect(() => {
		if (isOpen) {
			setDisplayName(currentDisplayName);
			setAvatarUrl(currentAvatarUrl);
			setAvatarPreview(currentAvatarUrl);
			setPendingFile(null);
			setError(null);
			setSuccess(false);
		}
	}, [isOpen, currentDisplayName, currentAvatarUrl]);

	if (!isOpen) return null;

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith("image/")) {
			setError("Only image files are allowed.");
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			setError("Image must be under 2 MB.");
			return;
		}

		setError(null);
		setPendingFile(file);

		// Show local preview immediately
		const reader = new FileReader();
		reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
		reader.readAsDataURL(file);
	};

	const handleSave = async () => {
		if (!displayName.trim()) {
			setError("Display name cannot be empty.");
			return;
		}
		setSaving(true);
		setError(null);

		try {
			let finalAvatarUrl = avatarUrl;

			// Upload new avatar if one was selected
			if (pendingFile) {
				setUploading(true);
				const ext = pendingFile.name.split(".").pop() ?? "png";
				const path = `${userId}/avatar.${ext}`;

				const { error: uploadError } = await supabase.storage
					.from("avatars")
					.upload(path, pendingFile, {
						upsert: true,
						contentType: pendingFile.type,
					});

				setUploading(false);

				if (uploadError)
					throw new Error("Avatar upload failed: " + uploadError.message);

				const { data: urlData } = supabase.storage
					.from("avatars")
					.getPublicUrl(path);

				// Bust the cache so the browser doesn't show the old image
				finalAvatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
			}

			// Update the profiles row
			const { error: updateError } = await supabase
				.from("profiles")
				.update({
					// Support both old `username` column and new `display_name` column
					...(displayName.trim() !== currentDisplayName && {
						display_name: displayName.trim(),
						username: displayName.trim(),
					}),
					...(finalAvatarUrl !== avatarUrl && { avatar_url: finalAvatarUrl }),
				})
				.eq("id", userId);

			if (updateError) throw new Error(updateError.message);

			setAvatarUrl(finalAvatarUrl);
			setSuccess(true);
			onUpdated(displayName.trim(), finalAvatarUrl);

			setTimeout(() => {
				setSuccess(false);
				onClose();
			}, 800);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Save failed.");
		} finally {
			setSaving(false);
			setUploading(false);
		}
	};

	const initials = displayName?.charAt(0).toUpperCase() ?? "?";

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4"
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className="bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-gray-700 overflow-hidden max-h-[90vh] overflow-y-auto">
				{/* Header banner */}
				<div className="h-24 bg-gradient-to-br from-indigo-600 to-purple-700 relative" />

				{/* Avatar — overlaps the banner */}
				<div className="px-6 pb-6">
					<div className="flex items-end justify-between -mt-12 mb-4">
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="relative group w-20 h-20 rounded-full border-4 border-gray-800 overflow-hidden flex-shrink-0 focus:outline-none"
							title="Change avatar"
						>
							{avatarPreview ? (
								<img
									src={avatarPreview}
									alt="Avatar"
									className="w-full h-full object-cover"
								/>
							) : (
								<div className="w-full h-full bg-indigo-600 flex items-center justify-center text-3xl font-bold text-white">
									{initials}
								</div>
							)}
							{/* Hover overlay */}
							<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
								<svg
									className="w-6 h-6 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
							</div>
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={handleFileChange}
						/>

						{/* Close button */}
						<button
							onClick={onClose}
							className="text-gray-400 hover:text-white transition p-1"
						>
							<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
								<path
									fillRule="evenodd"
									d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
									clipRule="evenodd"
								/>
							</svg>
						</button>
					</div>

					{/* Tag badge */}
					{tag && discriminator && (
						<p className="text-xs text-gray-500 mb-4 font-mono">
							{tag}
							<span className="text-gray-600">#{discriminator}</span>
							<span className="ml-2 text-gray-600 text-[10px]">
								— permanent, cannot be changed
							</span>
						</p>
					)}

					{/* Display name */}
					<div className="mb-4">
						<label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
							Display Name
						</label>
						<input
							type="text"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							maxLength={32}
							className="w-full px-3 py-2.5 bg-gray-900 text-white rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition"
							placeholder="Your display name"
						/>
					</div>

					{/* Avatar hint */}
					<p className="text-xs text-gray-500 mb-4">
						Click the avatar to upload a new image (max 2 MB).
					</p>

					{/* Error / success */}
					{error && <p className="text-xs text-red-400 mb-3">{error}</p>}
					{success && (
						<p className="text-xs text-green-400 mb-3">Profile updated!</p>
					)}

					{/* Actions */}
					<div className="flex gap-3">
						<button
							type="button"
							onClick={onClose}
							disabled={saving}
							className="flex-1 px-4 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition disabled:opacity-40"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={
								saving ||
								(!pendingFile && displayName.trim() === currentDisplayName)
							}
							className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition disabled:opacity-40 flex items-center justify-center gap-2"
						>
							{uploading ? (
								<>
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
									Uploading…
								</>
							) : saving ? (
								<>
									<span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
									Saving…
								</>
							) : (
								"Save"
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
