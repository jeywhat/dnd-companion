# 🎲 Compagnon D&D — D&D 5e Live Companion App

<div align="center">

![D&D Companion Banner](https://img.shields.io/badge/D%26D-5th%20Edition-8b5cf6?style=for-the-badge&logo=dungeonsanddragons&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2024-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Discord](https://img.shields.io/badge/Discord-Webhook-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-FR%20%7C%20EN-22c55e?style=for-the-badge)
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
- [🌍 Internationalization (i18n)](#-internationalization-i18n)
- [🔧 Configuration](#-configuration)
  - [🔗 URL Parameters (Share Links)](#-url-parameters-share-links)
  - [🔥 Firebase Realtime Sync](#-firebase-realtime-sync)
  - [📣 Discord Webhooks](#-discord-webhooks)
- [🚀 Deployment](#-deployment)
- [🏗️ Architecture](#️-architecture)
- [📁 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

### ⚔️ Combat & Character Management
- **HP Tracker** — Quick ±1/±5 buttons with live status indicator (green/yellow/red) and progress bar
- **Attack Manager** — Custom attacks with ability selection, proficiency toggle, bonus modifiers, and one-click rolls
- **Initiative Roll** — Dedicated d20 initiative button with auto-applied DEX modifier and 3D animation
- **Armor Class & Proficiency** — Always visible, auto-calculated from character level
- **Session Lock** — D20 button in the header: violet when unlocked, glowing green when locked to prevent accidental edits

### 🎲 Dice Rolling System
- **3D Physics Dice** — Powered by [@3d-dice/dice-box](https://github.com/3d-dice/dice-box) with realistic physics simulation
- **Advantage / Disadvantage** — Roll 2d20 and automatically take the highest or lowest
- **Free Dice Builder** — Combine any number of d4, d6, d8, d10, d12, d20 with a simple stepper UI
- **Critical & Fumble Detection** — Stunning gold/red animations on natural 20s and 1s

### 🏰 Room System (Multiplayer)
- **Create or Join a Room** — Game Master creates a room and shares a 6-character code; players join with that code
- **Roles** — **Game Master** (GM) and **Players** have distinct interfaces and permissions
- **Party Panel** *(left side, fixed)* — Real-time list of all connected members with avatar, class, level, and HP bar
  - GM card highlighted in gold with a crown 👑; no stats exposed
  - Player cards show HP bar, class, and level
- **Kick & Ban** — GM can temporarily kick a player (can rejoin with code) or permanently ban them
- **Auto-disconnect** — Players are notified and disconnected if the GM dissolves the room or the GM kicks/bans them

### 📡 Real-time Sync (Firebase SSE)
- **Roll Broadcasting** — Every d20 roll appears on all connected screens the moment it's thrown
- **Animated Remote Popups** — Slot-machine number animation in SVG die shapes, stacked per player
- **Party State Sync** — HP, avatar, class, and level synced in real time to the party panel
- **Auto-reconnect** — Seamlessly reconnects if Firebase connection drops

### ⚔️ Initiative Tracker (GM)
- **Trigger Initiative** — GM sends an initiative request to all players with one click
- **Blocking Modal (players)** — Players see a full-screen modal; they roll their d20 + DEX modifier with full 3D dice animation and the result is broadcast to everyone before confirming
- **Monster Management** — GM can add monsters with a custom initiative value and HP directly from the combat tab
- **Sorted Timeline** *(right side, fixed, visible to all)* — All participants ranked by initiative; current turn highlighted
- **Round & Turn Tracker** — GM advances turns and rounds; "Next Turn" loops back to round +1 automatically
- **Timeline Visibility Toggle** — GM can show or hide the initiative panel for players mid-combat
- **Clean End** — "End Combat" wipes the timeline instantly for everyone

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

### 🖼️ Character Avatar
- Upload any photo from the character sheet — cropped and compressed to 100×100 JPEG (Base64)
- Avatar stored in `localStorage` and synced to Firebase; appears in the party panel and initiative tracker
- Click the circular avatar zone to replace it at any time

### 🛡️ D&D 5e Rules Engine
- 6 ability scores (STR, DEX, CON, INT, WIS, CHA) with auto modifier calculation
- All 18 skill checks with proficiency tracking
- All 6 saving throws with proficiency tracking
- Passive Perception auto-calculation

### 🌍 Multilingual Support
- 🇫🇷 **French** (default) and 🇬🇧 **English** — switchable via flag buttons in the top-right corner
- Preference persisted in `localStorage` — no page reload required
- All UI strings, status messages, error messages, aria-labels, and confirm dialogs are fully translated

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
git clone https://github.com/YOUR_USERNAME/dnd-companion.git
cd dnd-companion

# Install dependencies
npm install

# Start development server (Vite, port 5173)
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

### First Run

#### As a Game Master
1. Open **Settings** ⚙️ → paste your **Discord Webhook URL** and **Firebase Database URL**
2. Fill in your character on the **Character Sheet** tab 📜 (optionally add an avatar)
3. Go to the **Room** 🏰 tab → click **Create a Room**, give it a name
4. Share the generated **6-character code** with your players
5. Your GM tab ⚔️ appears in the navigation — use it to manage combat

#### As a Player
1. Open **Settings** ⚙️ → paste your **Discord Webhook URL** and **Firebase Database URL**
2. Fill in your character on the **Character Sheet** tab 📜
3. Go to the **Room** 🏰 tab → enter the GM's code and click **Join**

---

## 🌍 Internationalization (i18n)

The app ships with **French (🇫🇷, default)** and **English (🇬🇧)** and can be extended to any language.

### Switching Language
Click the **flag buttons** in the **top-right corner** of the header. The entire UI updates instantly without a page reload.

### Adding a New Language

1. Copy `src/shared/locales/fr.js` → `src/shared/locales/xx.js`
2. Translate all values (keys must remain unchanged)
3. Register the locale in `src/shared/i18n.js`:

```js
import { xx } from "./locales/xx.js";
const TRANSLATIONS = { fr, en, xx };
```

4. Add a button in `src/app/shell.js`:

```html
<button type="button" class="locale-btn" data-locale="xx" aria-label="…" title="…">
  <img src="https://hatscripts.github.io/circle-flags/flags/xx.svg" width="22" height="22" alt="XX">
</button>
```

### i18n Architecture

```
src/shared/
├── i18n.js              # t(key, params) function + setLocale / getLocale
└── locales/
    ├── fr.js            # French translations (~250 keys)
    └── en.js            # English translations (~250 keys)
```

All strings use **named-parameter interpolation**:

```js
t("status.hpAdjusted", { current: 8, max: 20 })
// FR → "PV ajustés à 8/20."
// EN → "HP adjusted to 8/20."
```

---

## 🔧 Configuration

All settings are persisted in **localStorage** and configured via the Settings tab.

### 🔗 URL Parameters (Share Links)

Pre-configure the app for a player by opening a URL — useful for initial onboarding.

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fb` | Firebase Realtime Database URL | `?fb=https%3A%2F%2Fmy-project.firebaseio.com` |
| `wh` | Discord Webhook URL | `?wh=https%3A%2F%2Fdiscord.com%2Fapi%2Fwebhooks%2F...` |

Parameters are **automatically removed** from the URL after being applied (no accidental sharing of secrets).

> **Note:** The room code is entered manually via the Room tab, not via URL parameter.

### 🔥 Firebase Realtime Sync

Firebase Realtime Database is used for **zero-infrastructure multiplayer sync** — no backend required.

#### Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project → Build → **Realtime Database**
3. Choose a region, start in **Test mode** (or configure rules below)
4. Copy your database URL: `https://YOUR_PROJECT-default-rtdb.firebaseio.com`
5. Paste it in **Settings** ⚙️ → Firebase URL

#### Data Structure

```
/rooms/{code}/
├── _meta          → { name, gmSid, gmName, createdAt }   (room metadata)
├── _kicks/        → { [sid]: timestamp }                  (kick/ban signals)
├── _combat/       → { state, round, currentTurn,          (initiative tracker)
│                       panelVisible, initiatives: { … } }
└── {sessionId}/   → roll payload                          (dice roll events)
    party/
    └── {sessionId}/ → { name, className, level, currentHp, hpMax, avatar, … }
```

#### Recommended Security Rules

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> ⚠️ For production, restrict read/write to authenticated users or add rate limiting.

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
| ⚡ Initiative | Initiative button or modal | Violet |
| ⚔️ Damage Roll | Attack damage | Orange |
| ✨ Spell Cast | Cast button | Blue |
| 💚 HP Change | +/− HP buttons | Green/Red |
| 🎰 Free Dice | Free dice roll | Violet |
| 🏆 Critical Hit | Natural 20 | Gold |
| 💀 Critical Fail | Natural 1 | Red |

> **HP notifications are debounced by 4 seconds** to prevent spam when clicking buttons repeatedly.

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

## 🏗️ Architecture

The codebase follows **Clean Architecture (Ports & Adapters)** combined with **Feature-Sliced Design (FSD)** — enabling focused, single-feature commits and clear separation of concerns.

```
┌────────────────────────────────────────────────────────────────────┐
│                          UI / Shell                                 │
│    app/shell.js · app/renderer.js · app/events.js · main.js        │
├──────────────┬─────────────────────────────────────────────────────┤
│  Features    │  combat · rolls · grimoire · character · settings    │
│  (FSD)       │  room · party · combat-tracker                       │
│              │  Each: renderer.js + handler.js                      │
├──────────────┴─────────────────────────────────────────────────────┤
│                      Application State                              │
│                          app/store.js                               │
├──────────────────────────┬─────────────────────────────────────────┤
│  Core (Domain)           │  Adapters (Ports)                        │
│  core/character.js       │  adapters/storage.js                     │
│  core/dice.js            │  adapters/discord.js                     │
│                          │  adapters/firebase-sync.js               │
│                          │  adapters/combat-sync.js                 │
│                          │  adapters/room-sync.js                   │
│                          │  adapters/dice-animation.js              │
│                          │  adapters/anti-cheat.js                  │
├──────────────────────────┴─────────────────────────────────────────┤
│                       Shared Utilities                              │
│     shared/dom.js · shared/damage-parser.js                        │
│     shared/i18n.js · shared/locales/{fr,en}.js                     │
└────────────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

| Pattern | Where | Purpose |
|---------|-------|---------|
| **Dependency Inversion** | `store.js → injectRender(fn)` | Avoids circular dep `store ↔ renderer` |
| **Handler chain** | `events.js → ACTION_HANDLERS[]` | Each handler returns `true` if consumed |
| **Ports & Adapters** | `adapters/` folder | Swap Firebase/Discord without touching domain |
| **i18n** | `shared/i18n.js` | Synchronous `t(key, params)` with named interpolation |
| **Runtime-only state** | `state.party`, `state.combat` | Never persisted to localStorage |

---

## 📁 Project Structure

```
dnd-companion/
├── src/
│   ├── main.js                        # Bootstrap (10 lines)
│   ├── styles.css                     # All styles (responsive, animations)
│   ├── app/
│   │   ├── events.js                  # Event routing & action dispatch
│   │   ├── renderer.js                # Aggregated render() function
│   │   ├── shell.js                   # Static HTML shell template
│   │   └── store.js                   # Singleton state + commit/setStatus/triggerRender
│   ├── core/                          # Pure domain logic (no side effects)
│   │   ├── character.js               # Modifiers, bonuses, proficiencies
│   │   └── dice.js                    # Roll validation with crypto RNG
│   ├── adapters/                      # External service wrappers (Ports)
│   │   ├── anti-cheat.js              # Session baseline & integrity check
│   │   ├── combat-sync.js             # Initiative tracker SSE & REST ops
│   │   ├── dice-animation.js          # @3d-dice/dice-box wrapper
│   │   ├── discord.js                 # Webhook payloads & sending
│   │   ├── firebase-sync.js           # Rolls SSE listener & publisher, party sync
│   │   ├── room-sync.js               # Room create/join/kick/ban REST ops
│   │   └── storage.js                 # localStorage persistence
│   ├── features/                      # Feature-Sliced Design modules
│   │   ├── combat/
│   │   │   ├── handler.js             # HP, attacks, initiative actions
│   │   │   └── renderer.js            # Attack cards, last action, history
│   │   ├── combat-tracker/
│   │   │   ├── handler.js             # GM combat actions, player initiative modal
│   │   │   └── renderer.js            # Right timeline panel, GM tab, modal
│   │   ├── rolls/
│   │   │   ├── engine.js              # performRoll() — shared by all features
│   │   │   ├── handler.js             # Ability/skill/save/free dice actions
│   │   │   ├── renderer.js            # Ability/skill/save dashboards
│   │   │   └── templates.js           # Reusable HTML template builders
│   │   ├── grimoire/
│   │   │   ├── handler.js             # Cast spell, slot management
│   │   │   └── renderer.js            # Spell slots, spell list
│   │   ├── character/
│   │   │   ├── handler.js             # Form inputs, avatar upload, attack form
│   │   │   └── renderer.js            # Form values sync, ability hints
│   │   ├── party/
│   │   │   ├── handler.js             # Party SSE connection, member dedup
│   │   │   └── renderer.js            # Left fixed party panel
│   │   ├── room/
│   │   │   ├── handler.js             # Create/join/leave/dissolve, kick/ban
│   │   │   └── renderer.js            # Room tab: no-room form, active room view
│   │   └── settings/
│   │       ├── handler.js             # Discord, Firebase, export/import, lock
│   │       └── renderer.js            # Session lock summary
│   ├── shared/                        # Cross-feature utilities
│   │   ├── damage-parser.js           # Parse "1d8+3" damage strings
│   │   ├── dom.js                     # escapeHtml, uniqueId, updateFieldValue
│   │   ├── i18n.js                    # t(key, params) — locale engine
│   │   └── locales/
│   │       ├── fr.js                  # French translations (default, ~250 keys)
│   │       └── en.js                  # English translations (~250 keys)
│   └── data/
│       └── constants.js               # ABILITIES, SKILLS, ROLL_MODES, defaults
├── public/
│   └── assets/dice-box/               # 3D dice WebGL assets (large, ~2MB)
├── dist/                              # Production build output (git-ignored)
├── index.html                         # SPA entry point
├── vite.config.js                     # Vite build configuration
└── package.json
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

```bash
# Fork the repo, then clone your fork
git clone https://github.com/YOUR_USERNAME/dnd-companion.git
cd dnd-companion
npm install
npm run dev
```

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (vanilla JS, no frameworks)
- All identifiers (variables, functions, keys) must be in **English**
- UI strings go through `t(key)` — never hardcode display text in JS/HTML
- Test on both desktop and mobile
- Update this README if you add user-facing features

### Adding a Feature (FSD convention)

Each feature lives in `src/features/<name>/` with two files:
- `handler.js` — exports `handleXxxAction(button): boolean` and optional `handleXxxInput/Change/Submit`
- `renderer.js` — exports `renderXxx()` functions called from `app/renderer.js`

Register your handler in `src/app/events.js` → `ACTION_HANDLERS` array.

### Ideas for Contributions

- 🌍 **New language** — Add `src/shared/locales/de.js`, `es.js`, etc.
- 🎨 **Themes** — Dark/light mode toggle (CSS custom properties ready)
- 📊 **Roll History** — Persistent session log with statistics
- 🃏 **Condition Tracker** — Track blinded, poisoned, stunned, etc.
- 🗺️ **More Systems** — Pathfinder 2e, Shadowrun, Call of Cthulhu
- 🔒 **Firebase Auth** — Secure rooms with authenticated users
- 💉 **Monster HP Tracking** — GM-side HP management during combat

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

Made with ❤️ with AI for tabletop adventurers everywhere.

*"May your rolls be high and your DM be merciful."*

⭐ **Star this repo** if it helped your campaign!

</div>

