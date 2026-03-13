const { app, BrowserWindow, ipcMain, session, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

// ── Persistent settings store (JSON file in userData) ────────────────────────
let _settingsPath = null;
let _settingsCache = null;

function getSettingsPath() {
	if (!_settingsPath) {
		_settingsPath = path.join(app.getPath("userData"), "settings.json");
	}
	return _settingsPath;
}

function loadSettings() {
	if (_settingsCache) return _settingsCache;
	try {
		_settingsCache = JSON.parse(fs.readFileSync(getSettingsPath(), "utf8"));
	} catch {
		_settingsCache = {};
	}
	return _settingsCache;
}

function saveSettings(data) {
	_settingsCache = data;
	try {
		fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), "utf8");
	} catch (err) {
		console.error("[settings] Failed to save:", err);
	}
}

// Required for Agora WebRTC (getUserMedia + ICE) to work inside Electron.
app.commandLine.appendSwitch("use-fake-ui-for-media-stream", "0");
app.commandLine.appendSwitch("enable-features", "WebRtcHideLocalIpsWithMdns");
app.commandLine.appendSwitch(
	"disable-features",
	"BlockInsecurePrivateNetworkRequests",
);
app.commandLine.appendSwitch("ignore-certificate-errors");
app.commandLine.appendSwitch("allow-insecure-localhost", "true");

let mainWindow;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	const isDev = !app.isPackaged;

	if (isDev) {
		mainWindow.loadURL("http://localhost:3000");
		// Open DevTools in development
		mainWindow.webContents.openDevTools();
	} else {
		// For production: Next.js static export goes to 'out' folder
		mainWindow.loadFile(path.join(__dirname, "out/index.html"));
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	// ── Grant microphone (and camera) permissions ─────────────────────────────
	// Required for Agora's createMicrophoneAudioTrack() to work inside Electron.
	session.defaultSession.setPermissionRequestHandler(
		(webContents, permission, callback) => {
			const allowed = ["media", "mediaKeySystem", "geolocation"];
			callback(allowed.includes(permission));
		},
	);

	// Also needed for some Chromium versions that check synchronously.
	session.defaultSession.setPermissionCheckHandler(
		(webContents, permission) => {
			const allowed = ["media", "mediaKeySystem"];
			return allowed.includes(permission);
		},
	);

	createWindow();
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

// Recreate window when app is activated (macOS)
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// IPC Handlers for preload API
ipcMain.on("show-notification", (_event, { title, body }) => {
	if (!Notification.isSupported()) return;
	const n = new Notification({ title, body, silent: false });
	// Clicking the notification focuses the main window
	n.on("click", () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});
	n.show();
});

ipcMain.on("window-minimize", () => {
	if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
	if (mainWindow) {
		if (mainWindow.isMaximized()) {
			mainWindow.unmaximize();
		} else {
			mainWindow.maximize();
		}
	}
});

ipcMain.on("window-close", () => {
	if (mainWindow) mainWindow.close();
});

ipcMain.handle("get-audio-devices", async () => {
	// Return available audio devices
	return { devices: [] }; // Implement actual device enumeration if needed
});

ipcMain.handle("get-setting", async (_event, key) => {
	const settings = loadSettings();
	return key ? settings[key] ?? null : settings;
});

ipcMain.handle("set-setting", async (_event, key, value) => {
	const settings = loadSettings();
	if (value === undefined) {
		delete settings[key];
	} else {
		settings[key] = value;
	}
	saveSettings(settings);
	return true;
});

ipcMain.handle("start-recording", async () => {
	// Implement recording logic if needed on Electron side
	return { success: true };
});

ipcMain.handle("stop-recording", async () => {
	// Implement recording stop logic
	return { success: true };
});
