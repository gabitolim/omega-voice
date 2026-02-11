"use client";

import { useState, useEffect, useRef } from "react";

export interface ChatMessage {
	id: string;
	userId: string;
	username: string;
	message: string;
	timestamp: number;
}

interface ChatPanelProps {
	roomName: string;
	messages: ChatMessage[];
	currentUsername: string;
	onSendMessage: (message: string) => void;
}

export default function ChatPanel({
	roomName,
	messages,
	currentUsername,
	onSendMessage,
}: ChatPanelProps) {
	const [inputMessage, setInputMessage] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputMessage.trim()) {
			onSendMessage(inputMessage.trim());
			setInputMessage("");
		}
	};

	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<div className="w-80 bg-gray-800 flex flex-col border-l border-gray-900">
			{/* Header */}
			<div className="h-12 px-4 flex items-center border-b border-gray-900 bg-gray-850">
				<svg
					className="w-5 h-5 text-gray-400 mr-2"
					fill="currentColor"
					viewBox="0 0 20 20"
				>
					<path
						fillRule="evenodd"
						d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
						clipRule="evenodd"
					/>
				</svg>
				<h3 className="font-semibold text-white">Chat - {roomName}</h3>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-4 space-y-3">
				{messages.length === 0 ? (
					<div className="flex items-center justify-center h-full">
						<p className="text-gray-500 text-sm text-center">
							No messages yet.
							<br />
							Start the conversation!
						</p>
					</div>
				) : (
					messages.map((msg) => {
						const isOwnMessage = msg.username === currentUsername;
						return (
							<div
								key={msg.id}
								className={`flex flex-col ${isOwnMessage ? "items-end" : "items-start"}`}
							>
								<div className="flex items-baseline gap-2 mb-0.5">
									<span
										className={`text-xs font-semibold ${
											isOwnMessage ? "text-indigo-400" : "text-green-400"
										}`}
									>
										{msg.username}
									</span>
									<span className="text-xs text-gray-500">
										{formatTime(msg.timestamp)}
									</span>
								</div>
								<div
									className={`px-3 py-2 rounded-lg max-w-[85%] break-words ${
										isOwnMessage
											? "bg-indigo-600 text-white"
											: "bg-gray-700 text-gray-200"
									}`}
								>
									<p className="text-sm">{msg.message}</p>
								</div>
							</div>
						);
					})
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Input */}
			<div className="p-4 border-t border-gray-900">
				<form onSubmit={handleSubmit} className="flex gap-2">
					<input
						type="text"
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						placeholder="Type a message..."
						className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-400"
						maxLength={500}
					/>
					<button
						type="submit"
						disabled={!inputMessage.trim()}
						className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition font-medium"
					>
						<svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
							<path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
						</svg>
					</button>
				</form>
			</div>
		</div>
	);
}
