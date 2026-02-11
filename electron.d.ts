// Type definitions for Electron API exposed through preload

export interface ElectronAPI {
	platform: string;
	showNotification: (title: string, body: string) => void;
	getAudioDevices: () => Promise<{ devices: any[] }>;
	minimize: () => void;
	maximize: () => void;
	close: () => void;
	getSetting: (key: string) => Promise<any>;
	setSetting: (key: string, value: any) => Promise<boolean>;
	startRecording: () => Promise<{ success: boolean }>;
	stopRecording: () => Promise<{ success: boolean }>;
	onVoiceData: (callback: (data: any) => void) => void;
	removeVoiceListener: () => void;
}

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
	}
}

export {};
