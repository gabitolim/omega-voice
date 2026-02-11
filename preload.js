const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
	// Platform info
	platform: process.platform,

	// Notification API
	showNotification: (title, body) => {
		ipcRenderer.send("show-notification", { title, body });
	},

	// Audio device management
	getAudioDevices: () => ipcRenderer.invoke("get-audio-devices"),

	// Window controls
	minimize: () => ipcRenderer.send("window-minimize"),
	maximize: () => ipcRenderer.send("window-maximize"),
	close: () => ipcRenderer.send("window-close"),

	// Settings
	getSetting: (key) => ipcRenderer.invoke("get-setting", key),
	setSetting: (key, value) => ipcRenderer.invoke("set-setting", key, value),

	// Voice chat specific
	startRecording: () => ipcRenderer.invoke("start-recording"),
	stopRecording: () => ipcRenderer.invoke("stop-recording"),

	// Event listeners
	onVoiceData: (callback) => {
		ipcRenderer.on("voice-data", (event, data) => callback(data));
	},

	removeVoiceListener: () => {
		ipcRenderer.removeAllListeners("voice-data");
	},
});
