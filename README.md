# 🎲 Compagnon D&D — D&D 5e Live Companion App 
# (Currently only available in French)

<div align="center">

![D&D Companion Banner](https://img.shields.io/badge/D%26D-5th%20Edition-8b5cf6?style=for-the-badge&logo=dungeonsanddragons&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Discord](https://img.shields.io/badge/Discord-Webhook-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)

**A real-time D&D 5e companion app with 3D dice, multiplayer sync, and Discord notifications.**  
No account required. No pay-to-play. Just open and roll.

[🚀 Live Demo](https://jeywhat-dnd-companion.netlify.app/) · [📖 Documentation](#-table-of-contents) · [🐛 Report Bug](../../issues) · [✨ Request Feature](../../issues)

</div>

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🖼️ Screenshots](#️-screenshots)
- [⚡ Quick Start](#-quick-start)
- [🔧 Configuration](#-configuration)
  - [🔗 URL Parameters (Share Links)](#-url-parameters-share-links)
  - [🔥 Firebase Realtime Sync](#-firebase-realtime-sync)
  - [📣 Discord Webhooks](#-discord-webhooks)
- [🚀 Deployment](#-deployment)
- [🏗️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

### ⚔️ Combat & Character Management
- **HP Tracker** — Quick ±1/±5 buttons with live status indicator (green/yellow/red) and progress bar
- **Attack Manager** — Custom attacks with ability selection, proficiency toggle, bonus modifiers, and one-click rolls
- **Initiative Roll** — Dedicated d20 initiative button with auto-applied DEX modifier
- **Armor Class & Proficiency** — Always visible, auto-calculated from character level
- **Session Lock** — D20 button in the header: violet when unlocked, glowing green when locked to prevent accidental edits

### 🎲 Dice Rolling System
- **3D Physics Dice** — Powered by [@3d-dice/dice-box](https://github.com/3d-dice/dice-box) with realistic physics simulation
- **Advantage / Disadvantage** — Roll 2d20 and automatically take the highest or lowest
- **Free Dice Builder** — Combine any number of d4, d6, d8, d10, d12, d20 with a simple stepper UI
- **Critical & Fumble Detection** — Stunning gold/red animations on natural 20s and 1s

### 📡 Multiplayer Sync (Firebase)
- **Real-time Roll Broadcasting** — See every player's roll appear on your screen the moment they click
- **Animated Remote Popups** — Slot-machine number animation in SVG die shapes, stacked per player
- **Non-blocking Display** — Remote rolls appear as overlays; you can keep playing simultaneously
- **Auto-reconnect** — Seamlessly reconnects if Firebase connection drops

### 🔔 Discord Notifications
Automatic rich embeds for every action:
- 🎲 **Dice Rolls** — Result, bonus breakdown, roll mode (advantage/disadvantage)
- ⚔️ **Damage Rolls** — Dice notation, individual values, total
- ✨ **Spell Casts** — Spell name, level, slots remaining
- 💚 **HP Changes** — From → To with damage/healing type (debounced to avoid spam)
- 🎰 **Free Dice** — Custom combinations with full breakdown
- ⚡ **Initiative** — Highlighted initiative results

### 📜 Spell Management (Grimoire)
- Full 9-level spell slot tracker with per-level restore
- Add spells with name, level, slot cost, damage formula, and notes
- One-click cast: spends a slot, rolls damage, sends Discord notification
- **Long Rest** button restores all slots instantly

### 🛡️ D&D 5e Rules Engine
- 6 ability scores (STR, DEX, CON, INT, WIS, CHA) with auto modifier calculation
- All 18 skill checks with proficiency tracking
- All 6 saving throws with proficiency tracking
- Passive Perception auto-calculation

### 📱 Mobile-First UI
- Responsive bottom navigation bar always accessible
- Touch-friendly controls with large tap targets
- Safe-area padding for modern iOS/Android devices
- Offline-capable (localStorage persistence)

---

## 🖼️ Screenshots

> *Coming soon — contributions welcome!*

| Combat Tab | Dice Roll | Discord Notification |
|:---:|:---:|:---:|
| *Combat dashboard with HP tracker and attacks* | *3D dice animation overlay* | *Rich Discord embed* |

---

## ⚡ Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- A [Firebase Realtime Database](https://firebase.google.com/) project *(for multiplayer)*
- A [Discord Webhook](https://support.discord.com/hc/en-us/articles/228383668) URL *(for notifications)*

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/dnd-dashboard.git
cd dnd-dashboard

# Install dependencies
npm install

# Start development server (Vite only, port 5173)
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

### First Run
1. Open the **Settings** tab ⚙️
2. Paste your **Discord Webhook URL**
3. Enter your **Firebase Database URL** and a **Room Name**
4. Fill in your character on the **Character Sheet** tab 📜
5. Share the pre-filled URL with your party (see [Share Links](#-url-parameters-share-links))

---

## 🔧 Configuration

All settings are persisted in **localStorage** and can be configured via the Settings tab or via URL parameters for easy sharing.

### 🔗 URL Parameters (Share Links)

Configure the app instantly by opening a URL — perfect for sharing with your whole party.

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fb` | Firebase Realtime Database URL | `?fb=https%3A%2F%2Fmy-project.firebaseio.com` |
| `room` | Session / room name | `?room=campaign-one` |
| `wh` | Discord Webhook URL | `?wh=https%3A%2F%2Fdiscord.com%2Fapi%2Fwebhooks%2F...` |

Parameters are **automatically removed** from the URL after being applied (no accidental sharing of secrets).

#### 📋 Generate a Share Link

```
https://yourdomain.com/?fb=YOUR_FIREBASE_URL&room=YOUR_ROOM&wh=YOUR_WEBHOOK_URL
```

> **Tip:** URL-encode each value. In JavaScript: `encodeURIComponent("https://discord.com/...")`.

### 🔥 Firebase Realtime Sync

Firebase Realtime Database is used for **zero-infrastructure multiplayer sync** — no backend required.

#### Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project → Build → **Realtime Database**
3. Choose a region, start in **Test mode** (or configure rules below)
4. Copy your database URL: `https://YOUR_PROJECT-default-rtdb.firebaseio.com`

#### Recommended Security Rules

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read": true,
        ".write": true,
        "$session": {
          ".validate": "newData.hasChildren(['characterName', 'timestamp'])"
        }
      }
    }
  }
}
```

> ⚠️ For production, restrict read/write to authenticated users or specific room names.

#### Data Structure

```
your-project.firebaseio.com/
└── rooms/
    └── campaign-one/          ← room name (lowercase, hyphenated)
        ├── sessionAbc123/     ← auto-generated per browser session
        │   ├── characterName: "Aragorn"
        │   ├── label:         "Attack Roll"
        │   ├── rolls:         [{"sides": 20, "value": 17}]
        │   ├── total:         22
        │   ├── diceColor:     "#7c3aed"
        │   └── timestamp:     1712345678
        └── sessionXyz456/     ← another player
            └── ...
```

### 📣 Discord Webhooks

#### Setup

1. Open Discord → go to your campaign channel
2. Click **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**
3. Name it (e.g. "D&D Bot"), copy the URL
4. Paste it in the **Settings** tab or use the `?wh=` URL parameter

#### Notification Types

| Event | Trigger | Color |
|-------|---------|-------|
| 🎲 Ability/Skill Roll | Any d20 roll | Violet |
| ⚡ Initiative | Initiative button | Violet |
| ⚔️ Damage Roll | Attack damage | Orange |
| ✨ Spell Cast | Cast button | Blue |
| 💚 HP Change | +/− HP buttons | Green/Red |
| 🎰 Free Dice | Free dice roll | Violet |
| 🏆 Critical Hit | Natural 20 | Gold |
| 💀 Critical Fail | Natural 1 | Red |

> **HP notifications are debounced by 3 seconds** to prevent spam when clicking buttons repeatedly.

---

## 🚀 Deployment

The app is **100% static** — it only calls external APIs (Firebase, Discord). No server, no database, no secrets to manage on your end.

```bash
npm run build
# Upload the dist/ folder to any static host
```

### Recommended Hosts (free tier available)

| Host | Command / Method |
|------|-----------------|
| **Netlify** | Drag & drop `dist/` on [netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | `npx vercel --prod` from the project root |
| **GitHub Pages** | Push `dist/` to a `gh-pages` branch |
| **Cloudflare Pages** | Connect repo, set build command `npm run build`, output dir `dist` |
| **Any VPS / nginx** | `cp -r dist/* /var/www/html/` and serve statically |

> No environment variables or server configuration required.

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JS (ES2024), HTML5, CSS3 |
| **Bundler** | [Vite 8](https://vitejs.dev/) |
| **3D Dice** | [@3d-dice/dice-box 1.1.4](https://github.com/3d-dice/dice-box) |
| **Multiplayer** | [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) (SSE — no SDK) |
| **Notifications** | Discord Webhooks REST API |

> **No React, No Vue, No Angular, No backend** — pure vanilla JS for maximum performance and minimal bundle size.

---

## 📁 Project Structure

```
dnd-dashboard/
├── src/
│   ├── main.js                 # Application entry point
│   ├── styles.css              # All styles (responsive, animations)
│   ├── data/
│   │   └── constants.js        # D&D abilities, skills, defaults
│   └── services/
│       ├── antiCheat.js        # Session baseline & integrity monitoring
│       ├── character.js        # Modifier & bonus calculations
│       ├── dice.js             # Roll logic with crypto RNG
│       ├── diceAnimation.js    # 3D dice-box wrapper & overlays
│       ├── discord.js          # Webhook payloads & sending
│       ├── firebaseSync.js     # SSE listener & publisher
│       └── storage.js          # localStorage persistence
├── public/
│   └── assets/dice-box/        # 3D dice WebGL assets
├── dist/                       # Production build output (git-ignored)
├── index.html                  # SPA entry point
├── vite.config.js              # Vite build configuration
└── package.json
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

```bash
# Fork the repo, then clone your fork
git clone https://github.com/YOUR_USERNAME/dnd-dashboard.git
cd dnd-dashboard
npm install
npm run dev
```

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (vanilla JS, no frameworks)
- Test on both desktop and mobile
- Update this README if you add user-facing features

### Ideas for Contributions

- 🌍 **Translations** — English UI alongside French
- 🎨 **Themes** — Dark/light mode toggle
- 📊 **Roll History** — Persistent session log with statistics
- 🃏 **Condition Tracker** — Track blinded, poisoned, stunned, etc.
- 🗺️ **More Systems** — Pathfinder 2e, Shadowrun, Call of Cthulhu

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

Made with ❤️ with AI for tabletop adventurers everywhere.

*"May your rolls be high and your DM be merciful."*

⭐ **Star this repo** if it helped your campaign!

</div>
