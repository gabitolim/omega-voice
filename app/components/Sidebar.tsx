"use client";

interface Server {
	id: string;
	name: string;
	icon?: string;
}

interface SidebarProps {
	servers: Server[];
	currentServer: string | null;
	onServerClick: (serverId: string) => void;
	onHomeClick: () => void;
}

export default function Sidebar({
	servers,
	currentServer,
	onServerClick,
	onHomeClick,
}: SidebarProps) {
	return (
		<div className="w-[72px] bg-gray-900 flex flex-col items-center py-3 gap-2">
			{/* Home Button */}
			<button
				onClick={onHomeClick}
				className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl ${
					!currentServer
						? "bg-indigo-600 text-white"
						: "bg-gray-700 text-gray-400 hover:bg-indigo-600 hover:text-white"
				}`}
				title="Home"
			>
				<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
					<path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
				</svg>
			</button>

			{/* Divider */}
			<div className="w-8 h-0.5 bg-gray-700 rounded-full" />

			{/* Server List */}
			<div className="flex flex-col gap-2 overflow-y-auto flex-1 scrollbar-thin">
				{servers.map((server) => (
					<button
						key={server.id}
						onClick={() => onServerClick(server.id)}
						className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all hover:rounded-xl font-semibold text-lg ${
							currentServer === server.id
								? "bg-indigo-600 text-white rounded-xl"
								: "bg-gray-700 text-gray-300 hover:bg-indigo-600 hover:text-white"
						}`}
						title={server.name}
					>
						{server.icon || server.name.charAt(0).toUpperCase()}
					</button>
				))}
			</div>

			{/* Add Server Button */}
			<button
				className="w-12 h-12 rounded-2xl bg-gray-700 text-green-500 flex items-center justify-center hover:bg-green-600 hover:text-white hover:rounded-xl transition-all text-2xl"
				title="Add a Server"
			>
				+
			</button>
		</div>
	);
}
