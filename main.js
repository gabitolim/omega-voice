const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

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

app.whenReady().then(createWindow);

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
ipcMain.on("show-notification", (event, { title, body }) => {
	// You can implement native notifications here if needed
	console.log("Notification:", title, body);
});

ipcMain.on("window-minimize", () => {
	if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
	if (mainWindow) {
		mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
	}
});

ipcMain.on("window-close", () => {
	if (mainWindow) mainWindow.close();
});

ipcMain.handle("get-audio-devices", async () => {
	// Return available audio devices
	return { devices: [] }; // Implement actual device enumeration if needed
});

ipcMain.handle("get-setting", async (event, key) => {
	// Implement settings storage (can use electron-store)
	return null;
});

ipcMain.handle("set-setting", async (event, key, value) => {
	// Implement settings storage
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
