"use client";

import { memo } from "react";

export interface MemberEntry {
	user_id: string;
	username: string;
	avatar_url: string | null;
}

interface MemberListProps {
	onlineMembers: MemberEntry[];
	currentUserId: string;
}

function Avatar({
	url,
	username,
	size = 32,
}: {
	url: string | null;
	username: string;
	size?: number;
}) {
	if (url) {
		return (
			<img
				src={url}
				alt={username}
				style={{ width: size, height: size }}
				className="rounded-full object-cover flex-shrink-0"
			/>
		);
	}
	return (
		<div
			style={{ width: size, height: size }}
			className="rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold flex-shrink-0 text-sm"
		>
			{username.charAt(0).toUpperCase()}
		</div>
	);
}

function MemberRow({
	member,
	isSpeaking,
}: {
	member: MemberEntry;
	isSpeaking?: boolean;
}) {
	return (
		<div className="flex items-center gap-2.5 px-2 py-1 rounded hover:bg-gray-700/60 cursor-pointer group">
			<div className="relative flex-shrink-0">
				<Avatar url={member.avatar_url} username={member.username} size={32} />
				{isSpeaking && (
					<span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-gray-800" />
				)}
			</div>
			<span
				className={`text-sm truncate ${
					isSpeaking
						? "text-green-400"
						: "text-gray-300 group-hover:text-white"
				}`}
			>
				{member.username}
			</span>
		</div>
	);
}

function SectionHeader({ label, count }: { label: string; count: number }) {
	return (
		<div className="px-3 pt-4 pb-1">
			<p className="text-xs font-semibold uppercase tracking-wider text-gray-400 select-none">
				{label} — {count}
			</p>
		</div>
	);
}

function MemberList({ onlineMembers }: MemberListProps) {
	return (
		<div className="flex flex-col h-full bg-gray-800 overflow-y-auto overflow-x-hidden">
			{/* Header */}
			<div className="px-3 h-12 border-b border-gray-900 flex items-center flex-shrink-0">
				<h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 select-none">
					Members
				</h3>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-1">
				{/* Online members */}
				{onlineMembers.length > 0 ? (
					<>
						<SectionHeader label="Online" count={onlineMembers.length} />
						<div className="px-1">
							{onlineMembers.map((m) => (
								<MemberRow key={m.user_id} member={m} />
							))}
						</div>
					</>
				) : (
					<div className="px-4 py-8 text-center text-gray-500 text-sm">
						No members online
					</div>
				)}
			</div>
		</div>
	);
}

export default memo(MemberList);
