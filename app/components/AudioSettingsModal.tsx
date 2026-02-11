"use client";

import { useEffect, useState } from "react";

interface AudioDevice {
	deviceId: string;
	label: string;
}

interface AudioSettingsProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (settings: AudioSettings) => void;
	currentSettings: AudioSettings;
}

export interface AudioSettings {
	inputDeviceId: string;
	outputDeviceId: string;
	inputVolume: number;
	outputVolume: number;
	vadThreshold: number;
	pushToTalkEnabled: boolean;
	pushToTalkKey: string;
}

export default function AudioSettingsModal({
	isOpen,
	onClose,
	onSave,
	currentSettings,
}: AudioSettingsProps) {
	const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
	const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
	const [settings, setSettings] = useState<AudioSettings>(currentSettings);
	const [isListeningForKey, setIsListeningForKey] = useState(false);

	const loadDevices = async () => {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const inputs = devices
				.filter((d) => d.kind === "audioinput")
				.map((d) => ({
					deviceId: d.deviceId,
					label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`,
				}));
			const outputs = devices
				.filter((d) => d.kind === "audiooutput")
				.map((d) => ({
					deviceId: d.deviceId,
					label: d.label || `Speaker ${d.deviceId.slice(0, 5)}`,
				}));

			setInputDevices(inputs);
			setOutputDevices(outputs);
		} catch (error) {
			console.error("Error loading devices:", error);
		}
	};

	useEffect(() => {
		if (isOpen) {
			loadDevices();
		}
	}, [isOpen]);

	useEffect(() => {
		if (isListeningForKey) {
			const handleKeyDown = (e: KeyboardEvent) => {
				e.preventDefault();
				setSettings({ ...settings, pushToTalkKey: e.code });
				setIsListeningForKey(false);
			};

			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}
	}, [isListeningForKey, settings]);

	const handleSave = () => {
		onSave(settings);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div className="bg-gray-800 rounded-lg p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
				<h2 className="text-2xl font-bold text-white mb-6">Audio Settings</h2>

				{/* Input Device */}
				<div className="mb-6">
					<label className="block text-gray-400 text-sm font-semibold mb-2 uppercase">
						Input Device
					</label>
					<select
						value={settings.inputDeviceId}
						onChange={(e) =>
							setSettings({ ...settings, inputDeviceId: e.target.value })
						}
						className="w-full px-3 py-2 bg-gray-900 text-white rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						<option value="">Default</option>
						{inputDevices.map((device) => (
							<option key={device.deviceId} value={device.deviceId}>
								{device.label}
							</option>
						))}
					</select>
				</div>

				{/* Output Device */}
				<div className="mb-6">
					<label className="block text-gray-400 text-sm font-semibold mb-2 uppercase">
						Output Device
					</label>
					<select
						value={settings.outputDeviceId}
						onChange={(e) =>
							setSettings({ ...settings, outputDeviceId: e.target.value })
						}
						className="w-full px-3 py-2 bg-gray-900 text-white rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
					>
						<option value="">Default</option>
						{outputDevices.map((device) => (
							<option key={device.deviceId} value={device.deviceId}>
								{device.label}
							</option>
						))}
					</select>
				</div>

				{/* Input Volume */}
				<div className="mb-6">
					<label className="block text-gray-400 text-sm font-semibold mb-2 uppercase">
						Input Volume: {Math.round(settings.inputVolume * 100)}%
					</label>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={settings.inputVolume}
						onChange={(e) =>
							setSettings({
								...settings,
								inputVolume: parseFloat(e.target.value),
							})
						}
						className="w-full"
					/>
				</div>

				{/* Output Volume */}
				<div className="mb-6">
					<label className="block text-gray-400 text-sm font-semibold mb-2 uppercase">
						Output Volume: {Math.round(settings.outputVolume * 100)}%
					</label>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={settings.outputVolume}
						onChange={(e) =>
							setSettings({
								...settings,
								outputVolume: parseFloat(e.target.value),
							})
						}
						className="w-full"
					/>
				</div>

				{/* Voice Activity Detection */}
				<div className="mb-6">
					<label className="block text-gray-400 text-sm font-semibold mb-2 uppercase">
						Voice Sensitivity: {Math.round(settings.vadThreshold * 100)}%
					</label>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={settings.vadThreshold}
						onChange={(e) =>
							setSettings({
								...settings,
								vadThreshold: parseFloat(e.target.value),
							})
						}
						className="w-full"
					/>
					<p className="text-xs text-gray-500 mt-1">
						Lower = more sensitive (picks up quieter sounds)
					</p>
				</div>

				{/* Push to Talk */}
				<div className="mb-6">
					<label className="flex items-center gap-2 text-white cursor-pointer">
						<input
							type="checkbox"
							checked={settings.pushToTalkEnabled}
							onChange={(e) =>
								setSettings({
									...settings,
									pushToTalkEnabled: e.target.checked,
								})
							}
							className="w-5 h-5"
						/>
						<span className="font-semibold">Enable Push-to-Talk</span>
					</label>
					{settings.pushToTalkEnabled && (
						<div className="mt-3">
							<button
								onClick={() => setIsListeningForKey(true)}
								className={`px-4 py-2 rounded font-medium transition ${
									isListeningForKey
										? "bg-indigo-600 animate-pulse"
										: "bg-gray-700 hover:bg-gray-600"
								} text-white`}
							>
								{isListeningForKey
									? "Press any key..."
									: `Key: ${settings.pushToTalkKey || "Not set"}`}
							</button>
						</div>
					)}
				</div>

				{/* Buttons */}
				<div className="flex justify-end gap-3">
					<button
						onClick={onClose}
						className="px-4 py-2 text-white hover:underline"
					>
						Cancel
					</button>
					<button
						onClick={handleSave}
						className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded transition"
					>
						Save Settings
					</button>
				</div>
			</div>
		</div>
	);
}
