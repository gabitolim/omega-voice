# Omega Voice Chat - Setup Guide

## 📦 What's Been Set Up

Your Electron + Next.js + Socket.io + WebRTC voice chat app is ready! Here's what was configured:

### ✅ Components Created:

- **preload.js** - Secure IPC bridge between Electron and React
- **main.js** - Updated with preload script and IPC handlers
- **VoiceChat.tsx** - Full-featured voice chat component with WebRTC
- **server.js** - Socket.io signaling server for peer connections
- **electron.d.ts** - TypeScript definitions for Electron API

### ✅ Dependencies Added:

- `socket.io-client` - Client-side Socket.io for real-time communication
- `simple-peer` - WebRTC wrapper for peer-to-peer connections
- `@types/simple-peer` - TypeScript types

---

## 🚀 How to Run

### Step 1: Install Client Dependencies

```bash
npm install
```

### Step 2: Install Server Dependencies

```bash
cd server
npm install
cd ..
```

### Step 3: Start the Signaling Server

Open a terminal and run:

```bash
cd server
npm start
```

The server will start on `http://localhost:3001`

### Step 4: Start the Electron App

Open another terminal and run:

```bash
npm run dev
```

This will:

- Start Next.js on port 3000
- Launch Electron window with your app

---

## 🎮 How to Use

1. **App launches** - You'll see the voice chat interface
2. **Enter a room ID** - Type any room name (e.g., "my-room")
3. **Join the room** - Click "Join" and grant microphone permissions
4. **Share the room ID** - Others can join the same room to voice chat
5. **Controls**:
   - 🎤 **Mute** - Mute your microphone
   - 🔊 **Deafen** - Stop hearing others (and auto-mutes you)
   - **Leave Room** - Exit the voice channel

---

## 🏗️ Architecture Overview

### WebRTC Flow:

1. User joins room → Gets audio stream from microphone
2. Socket.io server coordinates peer connections
3. WebRTC establishes direct peer-to-peer audio connections
4. Audio streams between users with minimal latency

### Files Structure:

```
omega-voice/
├── main.js                    # Electron main process
├── preload.js                 # Electron preload (IPC bridge)
├── electron.d.ts              # TypeScript types
├── app/
│   ├── components/
│   │   └── VoiceChat.tsx     # Voice chat component
│   └── page.tsx              # Main page
├── server/
│   ├── server.js             # Socket.io signaling server
│   └── package.json          # Server dependencies
└── package.json              # Client app dependencies
```

---

## 🔧 Customization

### Change Server URL

In `VoiceChat.tsx`, update line ~244:

```typescript
connectToServer("http://localhost:3001"); // Change to your server URL
```

### Audio Settings

Modify audio constraints in `getUserMedia()` (~86):

```typescript
audio: {
    echoCancellation: true,    // Remove echo
    noiseSuppression: true,    // Reduce background noise
    autoGainControl: true,     // Normalize volume
}
```

### Window Settings

In `main.js`, adjust window properties:

```javascript
width: 1200,
height: 800,
// Add more options like:
// resizable: false,
// frame: false,
// transparent: true,
```

---

## 🌐 Deploy to Production

### Deploy Server (e.g., on Railway, Heroku, or VPS):

1. Push server folder to your hosting provider
2. Set environment variable: `PORT=3001` (or use their default)
3. Make sure Socket.io CORS is configured for your domain

### Build Desktop App:

```bash
npm run build:win
```

Your `.exe` file will be in the `dist/` folder!

---

## 🐛 Troubleshooting

### Microphone not working:

- Check browser/Electron permissions
- Make sure you're on HTTPS or localhost
- Verify no other apps are using the microphone

### Can't connect to server:

- Make sure server is running on port 3001
- Check firewall settings
- Verify the server URL in VoiceChat.tsx

### No audio from peers:

- Check browser console for WebRTC errors
- Ensure both users are in the same room
- Try refreshing both clients

### Build fails:

- Run `npm install` in both root and server folders
- Delete `node_modules` and reinstall
- Check that all dependencies are compatible

---

## 📚 Additional Features You Can Add

- **Push to Talk** - Hold a key to transmit audio
- **Audio Visualization** - Show waveforms while speaking
- **Screen Sharing** - Add video tracks to WebRTC peers
- **User Presence** - Show online/offline status
- **Room Passwords** - Secure private rooms
- **Recording** - Save voice conversations
- **Text Chat** - Add messaging alongside voice
- **User Profiles** - Avatars and usernames

---

## 🔒 Security Notes

- Current setup uses `contextIsolation: true` and `nodeIntegration: false` ✅
- Preload script exposes only specific IPC methods ✅
- For production: Add authentication to your Socket.io server
- For production: Use HTTPS and secure WebSocket connections (WSS)
- Consider adding end-to-end encryption for sensitive voice data

---

## 📖 Learn More

- **Electron Docs**: https://www.electronjs.org/docs
- **Socket.io Docs**: https://socket.io/docs
- **WebRTC Docs**: https://webrtc.org/getting-started/overview
- **SimplePeer Docs**: https://github.com/feross/simple-peer

---

Need help? Check the browser console and terminal for error messages!
