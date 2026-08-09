<div align="center">

# <span style="color:#ff2d95; text-shadow:0 0 12px #ff2d95, 0 0 28px #ff2d95;">codexapp</span>

### 🚀 Run Codex App UI Anywhere: Linux, Windows, or Termux on Android 🚀

[![npm](https://img.shields.io/npm/v/codexapp?style=for-the-badge&color=ff2d95&logo=npm&logoColor=white&labelColor=1a1b2f)](https://www.npmjs.com/package/codexapp)
[![platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android-00d8ff?style=for-the-badge&labelColor=1a1b2f)](#-quick-start)
[![node](https://img.shields.io/badge/Node-18%2B-05ffa1?style=for-the-badge&logo=node.js&logoColor=white&labelColor=1a1b2f)](https://nodejs.org/)
[![license](https://img.shields.io/badge/License-MIT-f7f32b?style=for-the-badge&labelColor=1a1b2f)](./LICENSE)

</div>

```text
 ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗██╗   ██╗██╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝██║   ██║██║
██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ██║   ██║██║
██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ██║   ██║██║
╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗╚██████╔╝██║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝
```

---

<div align="center">

<img width="1366" height="900" alt="image" src="https://github.com/user-attachments/assets/1a3578ba-add8-49a2-88b4-08195a7f0140" />

</div>

---

## <span style="color:#b967ff; text-shadow:0 0 10px #b967ff;">🤯 What Is This?</span>

> **Codex UI in your browser. No drama. One command.**
>  
> **Yes, that is your Codex desktop app experience exposed over web UI. Yes, it runs cross-platform.**

**`codexapp`** is a lightweight bridge that gives you a browser-accessible UI for Codex app-server workflows.

You run one command. It starts a local web server. You open it from your machine, your LAN, or wherever your setup allows.  

**TL;DR 🧠: Codex app UI, unlocked for Linux, Windows, and Termux-powered Android setups.**

---

## <span style="color:#00d8ff; text-shadow:0 0 10px #00d8ff;">⚡ Quick Start</span>

```bash
# 🔓 Run instantly (recommended)
npx codexapp

# 🌐 Then open in browser
# http://localhost:18923
```

By default, `codexapp` now also starts:

```bash
cloudflared tunnel --url http://localhost:<port>
```

It prints the tunnel URL, terminal QR code, and password together in startup output.  
Use `--no-tunnel` to disable this behavior.

If you are using a provider or AI gateway that is already authenticated and do not want `codexapp` to force `codex login` during startup, use:

```bash
npx codexapp --no-login
```

### 🐧 Linux

```bash
node -v   # should be 18+
npx codexapp
```

### 🪟 Windows (PowerShell)

```powershell
node -v   # 18+
npx codexapp
```

### 🤖 Termux (Android)

```bash
pkg update && pkg upgrade -y
pkg install nodejs -y
npx codexapp
```

Android background requirements:

1. Keep `codexapp` running in the current Termux session (do not close it).
2. In Android settings, disable battery optimization for `Termux`.
3. Keep the persistent Termux notification enabled so Android is less likely to kill it.
4. Optional but recommended in Termux:
```bash
termux-wake-lock
```
5. Open the shown URL in your Android browser. If the app is killed, return to Termux and run `npx codexapp` again.

---

## <span style="color:#05ffa1; text-shadow:0 0 10px #05ffa1;">📡 iPhone / iPad via Tailscale Serve</span>

If you want to use codexUI from iPhone or iPad Safari, serving it over HTTPS is recommended.

A practical private setup is to run codexUI locally and publish it inside your tailnet with Tailscale Serve:

```powershell
npx codexapp --no-tunnel --port 5900
tailscale serve --bg 5900
```

Then open:

```text
https://<your-machine>.<your-tailnet>.ts.net
```

This setup worked well in practice for:

- iPhone Safari access
- Add to Home Screen
- the built-in dictation / transcription feature in the app
- viewing the same projects and conversations from the Windows host

Notes:

- Tailscale Serve keeps access private to your tailnet
- on iOS, HTTPS / secure context appears to be important for mobile browser access and dictation
- some minor mobile Safari CSS issues may still exist, but they do not prevent normal use
- depending on proxying details, authentication behavior may differ from direct remote access
- if conversations created in the web UI do not immediately appear in the Windows app, restarting the Windows app may refresh them

---

## <span style="color:#ff2d95; text-shadow:0 0 10px #ff2d95;">✨ Features</span>

- 🚀 One-command launch with `npx codexapp`
- 🌍 Cross-platform support for Linux, Windows, and Termux on Android
- 🖥️ Browser-first Codex UI flow on `http://localhost:18923`
- 🌐 LAN-friendly access from other devices on the same network
- 🧪 Remote/headless-friendly setup for server-based Codex usage
- 🔌 Works with reverse proxies and tunneling setups
- ⚡ No global install required for quick experimentation
- 🎙️ Built-in hold-to-dictate voice input with transcription to composer draft
- 🤖 Optional Telegram bot bridge: send messages to bot, forward into mapped thread, send assistant reply back to Telegram
- 💾 Project portability: export a project as a ZIP from project or thread menus, including matching Codex chat JSONL history under `.codex-project/chats/`
- 📦 Project import: restore exported project ZIPs from the browser via `Import Project`
- 🔁 Imported chats are rewritten for the destination `CODEX_HOME`, project path, and currently selected provider/model so they can be resumed in the new environment
- ⚙️ Project ZIP performance: exports stream ZIP bytes with response backpressure handling and skip generated/git-ignored folders; imports still buffer the selected ZIP once because the browser upload arrives as a single file

### 🤖 Telegram Bot Bridge (Optional)

Set these environment variables before starting `codexapp`:

```bash
export TELEGRAM_BOT_TOKEN="<your-telegram-bot-token>"
export TELEGRAM_ALLOWED_USER_IDS="<your-telegram-user-id>,<optional-second-id>"
export TELEGRAM_DEFAULT_CWD="$PWD" # optional, defaults to current working directory
npx codexapp
```

`TELEGRAM_ALLOWED_USER_IDS` is required for safe access. Only allowlisted Telegram user IDs can use the bridge. If no allowed user IDs are configured, incoming Telegram messages are rejected.

To find your Telegram user ID:

1. Send a message to your bot.
2. Run `curl "https://api.telegram.org/bot<your-telegram-bot-token>/getUpdates"`.
3. Read `message.from.id` from the returned update payload.

Bot commands:

- `/start` show quick help and thread picker
- `/threads` list recent threads and pick one
- `/newthread` create and map a new Codex thread for this Telegram chat
- `/thread <threadId>` map current Telegram chat to an existing thread
- `/current` show currently connected thread for this chat
- `/history` show recent history for current thread
- `/status` show bridge/mapping status
- `/whoami` show your Telegram user/chat IDs and authorization state
- `/help` show command reference

Outgoing assistant messages are sent with Telegram `parse_mode=HTML` for formatting, with automatic plain-text fallback if HTML delivery fails.

---

## <span style="color:#00d8ff; text-shadow:0 0 10px #00d8ff;">🧩 Recent Product Features (from main commits)</span>

> **Not just launch. Actual UX upgrades.**

- 🗂️ Searchable project picker in new-thread flow
- ➕ "Create Project" button next to "Select folder" with browser prompt
- 📌 New projects get pinned to top automatically
- 🧠 Smart default new-project name suggestion via server-side free-directory scan (`New Project (N)`)
- 🔄 Project order persisted globally to workspace roots state
- 🧵 Optimistic in-progress threads preserved during refresh/poll cycles
- 📱 Mobile drawer sidebar in desktop layout (teleported overlay + swipe-friendly structure)
- 🎛️ Skills Hub mobile-friendly spacing/toolbar layout improvements
- 🪟 Skill detail modal tuned for mobile sheet-style behavior
- 🧪 Skills Hub event typing fix for `SkillCard` select emit compatibility
- 🎙️ Voice dictation flow in composer (`hold to dictate` -> transcribe -> append text)

---

## <span style="color:#f7f32b; text-shadow:0 0 10px #f7f32b;">🌍 What Can You Do With This?</span>

| 🔥 Use Case | 💥 What You Get |
|---|---|
| 💻 Linux workstation | Run Codex UI in browser without depending on desktop shell |
| 🪟 Windows machine | Launch web UI and access from Chrome/Edge quickly |
| 📱 Termux on Android | Start service in Termux and control from mobile browser |
| 🧪 Remote dev box | Keep Codex process on server, view UI from client device |
| 🌐 LAN sharing | Open UI from another device on same network |
| 🧰 Headless workflows | Keep terminal + browser split for productivity |
| 🔌 Custom routing | Put behind reverse proxy/tunnel if needed |
| ⚡ Fast experiments | `npx` run without full global setup |

---

## <span style="color:#b967ff; text-shadow:0 0 10px #b967ff;">🖼️ Screenshots</span>

### Skills Hub
![Skills Hub](docs/screenshots/skills-hub.png)

### Chat
![Chat](docs/screenshots/chat.png)

### Mobile UI
![Skills Hub Mobile](docs/screenshots/skills-hub-mobile.png)
![Chat Mobile](docs/screenshots/chat-mobile.png)

---

## <span style="color:#05ffa1; text-shadow:0 0 10px #05ffa1;">🏗️ Architecture</span>

```text
┌─────────────────────────────┐
│  Browser (Desktop/Mobile)   │
└──────────────┬──────────────┘
               │ HTTP/WebSocket
┌──────────────▼──────────────┐
│         codexapp            │
│  (Express + Vue UI bridge)  │
└──────────────┬──────────────┘
               │ RPC/Bridge calls
┌──────────────▼──────────────┐
│      Codex App Server       │
└─────────────────────────────┘
```

---

## <span style="color:#ff2d95; text-shadow:0 0 10px #ff2d95;">🎯 Requirements</span>

- ✅ Node.js `18+`
- ✅ Codex app-server environment available
- ✅ Browser access to host/port
- ✅ Microphone permission (only for voice dictation)

---

## <span style="color:#f7f32b; text-shadow:0 0 10px #f7f32b;">🐛 Troubleshooting</span>

| ❌ Problem | ✅ Fix |
|---|---|
| Port already in use | Run on a free port or stop old process |
| `npx` fails | Update npm/node, then retry |
| Termux install fails | `pkg update && pkg upgrade` then reinstall `nodejs` |
| Can’t open from other device | Check firewall, bind address, and LAN routing |

---

## <span style="color:#00d8ff; text-shadow:0 0 10px #00d8ff;">🤝 Contributing</span>

Issues and PRs are welcome.  
Bring bug reports, platform notes, and setup improvements.

---

## <span style="color:#ff2d95; text-shadow:0 0 10px #ff2d95;">⭐ Star This Repo</span>

If you believe Codex UI should be accessible from **any machine, any OS, any screen**, star this project and share it. ⭐

---

## <span style="color:#05ffa1; text-shadow:0 0 10px #05ffa1;">🔧 Repository Customizations</span>

> **Everything we customized in this repository — UI/UX and framework/architecture — beyond the original fork.**

### UI / UX Changes

- **New "Aegis" security tab** (originally named "Sentineal"): dependency/vulnerability scanner with a summary bar, severity tiles (critical / high / moderate / low / clean), and a per-package advisory list with fix versions and detail links. Runs keyless npm bulk-advisories scans plus an optional Socket.dev deep scan.
- **New "Database" tab**: deployment-aware data explorer with a table list (with row counts), a SQL runner (SELECT-only for Supabase), and a result grid. Auto-detects the environment and switches between local SQLite and Supabase cloud mode.
- **New "AI Models" tab**: hardware-based offline model suggestions, Ollama detect/pull, HuggingFace search, cloud LLM provider management with an add/remove modal, per-provider model tags, and a manual "Sync now" button.
- **Advanced section in sidebar**: the new Aegis, Database, and AI Models tabs are grouped under the existing "Advanced" sidebar section.
- **Lazy-loaded panels**: all new tabs use `defineAsyncComponent`, so they only download when opened — the app stays light.

### Framework / Architecture Changes

- **Server-side routers**: added `handleAegisRoutes`, `handleDatabaseRoutes`, and `handleAiModelsRoutes`, registered in the bridge middleware chain in `src/server/codexAppServerBridge.ts` (API prefixes `/codex-api/aegis`, `/codex-api/database`, `/codex-api/ai-models`).
- **Typed API clients**: each new feature ships a typed client in `src/api/` and a matching router test file in `src/server/` (18 test files / 161 tests passing).
- **Secure config storage**: API keys are stored server-side in `~/.codex/aegis-config.json` and `~/.codex/ai-models-config.json` and are never returned to the client (sanitized responses).
- **Local database**: uses `node:sqlite` (`DatabaseSync`) for the local store with a JSON file fallback; cloud mode uses Supabase REST when `SUPABASE_URL` plus a service/anon key is present; Docker is detected via `/proc/1/cgroup` or container marker files.
- **Background model sync**: an unref'd 10-minute `setInterval` keeps AI model data fresh, kicked off automatically at bridge startup (`runAiModelsPeriodicSyncNow()`).
- **Android/Termux build support**: prebuilt native binaries don't load on ARM/musl, so builds run with `NAPI_RS_FORCE_WASI=true` and WASM fallbacks for rollup, lightningcss, and Tailwind oxide.
- **Backup**: the original upstream README is kept in this repo as **`README-backup-original.md`**.

---

<div align="center">

<span style="color:#ff2d95; text-shadow:0 0 8px #ff2d95;">━━━━━━━━━━━━━━━━━━━</span> <span style="color:#00d8ff; text-shadow:0 0 8px #00d8ff;">◆</span> <span style="color:#05ffa1; text-shadow:0 0 8px #05ffa1;">◆</span> <span style="color:#00d8ff; text-shadow:0 0 8px #00d8ff;">◆</span> <span style="color:#ff2d95; text-shadow:0 0 8px #ff2d95;">━━━━━━━━━━━━━━━━━━━</span>

Built for speed, portability, and a little bit of chaos 😏

</div>

---

Forked from [pavel-voronin/codex-web-local](https://github.com/pavel-voronin/codex-web-local) by Pavel Voronin.
