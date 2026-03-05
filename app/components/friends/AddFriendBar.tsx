"use client";
import { useState } from "react";

interface AddFriendBarProps {
	onSend: (tag: string) => Promise<string | null>;
}

export default function AddFriendBar({ onSend }: AddFriendBarProps) {
	const [value, setValue] = useState("");
	const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
		null,
	);
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setStatus(null);
		const err = await onSend(value.trim());
		setStatus(
			err ? { ok: false, msg: err } : { ok: true, msg: "Friend request sent!" },
		);
		if (!err) setValue("");
		setLoading(false);
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="flex flex-col gap-2 p-4 border-b border-white/10"
		>
			<p className="text-xs text-white/50 uppercase tracking-widest font-semibold">
				Add Friend
			</p>
			<div className="flex gap-2">
				<input
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder="username#0000"
					className="flex-1 bg-black/30 rounded px-3 py-2 text-sm text-white placeholder-white/30 outline-none border border-white/10 focus:border-indigo-500"
				/>
				<button
					type="submit"
					disabled={loading || !value}
					className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded text-sm font-semibold transition"
				>
					Send
				</button>
			</div>
			{status && (
				<p
					className={`text-xs ${status.ok ? "text-green-400" : "text-red-400"}`}
				>
					{status.msg}
				</p>
			)}
		</form>
	);
}
