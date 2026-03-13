# Omega Voice — Setup Guide

## 🏗️ Architecture

Omega Voice is a Discord-style desktop voice chat app built with:

| Layer | Technology |
|---|---|
| Desktop shell | **Electron** (main process in `main.js`) |
| Frontend | **Next.js 16 + React 19** (rendered inside Electron) |
| Auth & Database | **Supabase** (email/password auth, Postgres, Realtime, Storage) |
| Voice transport | **Agora RTC SDK** (token-gated, low-latency audio) |
| Styling | **Tailwind CSS** |

---

## 📋 Prerequisites

- **Node.js** ≥ 18
- A **Supabase** project (free tier works)
- An **Agora** account and App ID

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file at the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_AGORA_APP_ID=your-agora-app-id
```

### 3. Set up Supabase

Run the following SQL in your Supabase SQL editor:

```sql
-- Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  tag text unique,
  discriminator text
);

-- Rooms (voice + text channels)
create table rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Participants (who's in which voice room)
create table participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  username text,
  joined_at timestamptz default now(),
  unique (room_id, user_id)
);

-- Messages (text chat, scoped per room)
create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  username text,
  content text,
  created_at timestamptz default now()
);

-- Friends
create table friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  friend_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, friend_id)
);

-- Friend requests
create table friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete cascade,
  receiver_id uuid references auth.users(id) on delete cascade,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (sender_id, receiver_id)
);
```

Enable **Realtime** on the `rooms`, `participants`, `messages`, `friends`, and `friend_requests` tables in the Supabase dashboard.

### 4. Deploy the Agora token Edge Function

```bash
supabase functions deploy get-agora-token
```

Set the secret in your Supabase project:

```bash
supabase secrets set AGORA_APP_CERTIFICATE=your-agora-certificate
```

### 5. Run in development

```bash
npm run dev
```

This starts Next.js on port 3000 and launches the Electron window automatically.

---

## 📁 Key Files

```
omega-voice/
├── main.js                          # Electron main process + IPC handlers
├── preload.js                       # Secure IPC bridge (contextBridge)
├── electron.d.ts                    # TypeScript types for window.electronAPI
├── assets/
│   └── icon.ico                     # Windows build icon
├── app/
│   ├── components/
│   │   ├── DiscordLayout.tsx        # Root orchestrator — all UI state lives here
│   │   ├── Sidebar.tsx              # Server/Home sidebar (left column)
│   │   ├── ChannelList.tsx          # Voice channel list + user presence
│   │   ├── ChatPanel.tsx            # Text chat (per-room)
│   │   ├── VoiceRoom.tsx            # Headless voice hooks + participant state
│   │   ├── UserBar.tsx              # Current user strip (mute/deafen/settings)
│   │   ├── AudioSettingsModal.tsx   # Audio device + PTT settings
│   │   ├── AuthScreen.tsx           # Sign-in / Sign-up
│   │   └── friends/
│   │       ├── FriendsPanel.tsx     # Friends view
│   │       ├── FriendsList.tsx      # Friends + pending requests list
│   │       └── AddFriendBar.tsx     # Send request by tag#discriminator
│   ├── hooks/
│   │   ├── agora/useAgoraVoice.ts   # Full Agora RTC lifecycle
│   │   ├── supabase/
│   │   │   ├── useSupabasePresence.ts   # Speaking state broadcast
│   │   │   └── useSupabaseRealtime.ts   # Participant DB subscriptions
│   │   ├── useFriends.ts            # Friends CRUD + realtime
│   │   └── useColumnResize.ts       # Draggable column widths
│   └── lib/
│       └── supabaseClient.ts        # Supabase client + all DB types
└── supabase/
    └── functions/
        └── get-agora-token/
            └── index.ts             # Edge function — Agora token minting
```

---

## 🎮 Features

- 🔐 **Auth** — email/password sign-up and sign-in via Supabase
- 🎙️ **Voice channels** — Agora-powered real-time audio with mute, deafen, push-to-talk
- 📊 **Voice Activity Detection** — speaking ring indicator around avatars
- 💬 **Text chat** — per-room chat (switches automatically when you join a voice room)
- 👥 **Friends** — send/accept/decline requests by `tag#discriminator`, real-time updates
- 🔔 **Native notifications** — OS notifications for new messages and friend requests (Electron)
- 🎛️ **Audio settings** — per-device input/output selection, volume sliders, VAD sensitivity, PTT key
- 💾 **Persistent settings** — stored in Electron's userData via the `getSetting`/`setSetting` IPC (localStorage fallback in browser)
- 📐 **Resizable layout** — drag the column dividers to resize sidebar, channel list, and chat

---

## 🏗️ Building for Production

```bash
npm run build:win    # Windows installer
```

Output goes to the `dist/` folder. The build icon is at `assets/icon.ico`.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| Microphone not working | Check Electron permissions; the app requests mic access on startup |
| Voice not connecting | Verify `NEXT_PUBLIC_AGORA_APP_ID` is correct and the token edge function is deployed |
| Auth not working | Check Supabase URL and anon key in `.env.local` |
| Realtime not updating | Enable Realtime on all tables in the Supabase dashboard |
| Build fails | Run `npm install`, delete `.next/` and retry |

---

## 🔒 Security

- `contextIsolation: true` and `nodeIntegration: false` in Electron ✅
- Preload script exposes only specific IPC methods via `contextBridge` ✅
- Agora tokens are minted server-side (Supabase Edge Function), never exposed to clients ✅
- Supabase Row Level Security (RLS) should be enabled for production deployments
