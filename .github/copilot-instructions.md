# GitHub Copilot Instructions — D&D Companion

## Project Overview

A real-time D&D 5e companion web app. Vanilla JavaScript (ES2024), Vite 8, no framework, no JSX, no TypeScript.
Key integrations: Firebase Realtime Database (multiplayer sync), Discord Webhooks (roll notifications), @3d-dice/dice-box (3D WebGL dice).
Deployed as a fully static SPA (no backend).

---

## Architecture

The project uses **Clean Architecture (Ports & Adapters)** combined with **Feature-Sliced Design (FSD)**.

```
src/
├── main.js            # Bootstrap only (~10 lines)
├── app/               # Application orchestration
│   ├── store.js       # Singleton state + commit/setStatus/addHistory
│   ├── renderer.js    # Aggregated render() — calls all feature renderers
│   ├── shell.js       # getAppTemplate() — full HTML shell string
│   └── events.js      # bindEvents() + central event routing
├── core/              # Pure domain logic — NO DOM, NO fetch, NO side effects
│   ├── character.js   # Modifier/bonus/proficiency calculations
│   └── dice.js        # Roll engine with crypto RNG
├── adapters/          # External service wrappers (Ports implementation)
│   ├── storage.js     # localStorage persistence
│   ├── discord.js     # Discord webhook payloads
│   ├── firebase-sync.js  # Firebase Realtime DB listener + publisher
│   ├── dice-animation.js # @3d-dice/dice-box wrapper
│   └── anti-cheat.js  # Session integrity baseline
├── features/          # Feature-Sliced Design — one folder per tab
│   ├── combat/        # ⚔️ Dashboard tab
│   ├── rolls/         # 🎲 Rolls tab
│   ├── grimoire/      # ✨ Spells tab
│   ├── character/     # 📜 Character Sheet tab
│   └── settings/      # ⚙️ Settings tab
├── shared/            # Cross-feature utilities
│   ├── dom.js         # escapeHtml, uniqueId, updateFieldValue
│   ├── damage-parser.js # parseDamageString("1d8+3")
│   ├── i18n.js        # t(key, params) locale engine
│   └── locales/
│       ├── fr.js      # French translations (~150 keys, default)
│       └── en.js      # English translations (~150 keys)
└── data/
    └── constants.js   # ABILITIES, SKILLS, ROLL_MODES, DEFAULT_STATE
```

### Layer Rules

| Layer | Can import | Cannot import |
|-------|-----------|---------------|
| `core/` | nothing external | `adapters/`, `features/`, `app/`, DOM |
| `adapters/` | `core/`, `shared/`, `data/` | `features/`, `app/` |
| `features/X/` | `core/`, `adapters/`, `shared/`, `data/`, `app/store.js` | other `features/` |
| `app/` | everything | nothing outside `src/` |
| `shared/` | other `shared/` only | everything else |

---

## State Management

All mutable state lives in `app/store.js` as a single `state` object.

```js
// Reading state
import { state } from "../app/store.js";
const hp = state.character.currentHp;

// Writing state — always via commit()
import { state, commit } from "../app/store.js";
state.character.currentHp -= damage;
commit();           // triggers render + saves to localStorage
commit(false);      // triggers render WITHOUT syncing input values (avoids cursor jumps)
```

**Circular dependency prevention**: `store.js` does NOT import `renderer.js` directly.  
Instead, `main.js` wires them with `injectRender(render)` after importing both.  
Never import `renderer.js` inside `store.js`.

Helper functions on `store.js` (always prefer these over direct `state` mutation):
- `setStatus(message)` — set the status bar text
- `addHistory(entry)` — push to roll history
- `queueSave()` — debounced localStorage save

---

## Feature Handler Contract

Each feature has a `handler.js` that exports handler functions registered in `app/events.js`.

```js
// features/example/handler.js
export function handleExampleAction(button) {
  const action = button.dataset.action;
  if (action === "my-action") {
    // do work
    return true;  // ← CONSUMED, stop propagation through handler chain
  }
  return false;   // ← not handled, try next handler
}
```

In `app/events.js`, the `ACTION_HANDLERS` array is iterated in order — first `true` wins:

```js
const ACTION_HANDLERS = [
  handleCombatAction,
  handleRollsAction,
  handleGrimoireAction,
  handleCharacterAction,
  handleSettingsAction,
];
```

When adding a new feature: export your handler from `features/<name>/handler.js`, import it in `events.js`, and add it to `ACTION_HANDLERS`.

---

## Rendering

`app/renderer.js` exports `render(syncInputs = true)`.  
It calls all feature renderers sequentially — no feature renderer should call another.

```js
// app/renderer.js pattern
export function render(syncInputs = true) {
  renderCombat(syncInputs);
  renderRolls();
  renderGrimoire();
  renderCharacter(syncInputs);
  renderSettings();
}
```

Feature renderers write directly to the DOM via `document.getElementById()` or `querySelector()`.  
They must be **idempotent** — calling them multiple times produces the same result.

The HTML shell is generated once in `getAppTemplate()` (`app/shell.js`) and written to `appElement.innerHTML`.  
Shell re-renders only occur on language switch or full reset.

---

## Internationalization (i18n)

**Rule: Never hardcode display strings in JS or HTML templates.** Always use `t(key, params?)`.

```js
import { t } from "../shared/i18n.js";

// Simple key
t("nav.combat")                           // "Combat" or "Kampf"

// Parameterized (named placeholders)
t("status.hpAdjusted", { current: 8, max: 20 })
// FR: "PV ajustés à 8/20."
// EN: "HP adjusted to 8/20."
```

Locale is stored in `localStorage` under key `dnd-companion-locale`. Default: `fr`.

### Adding a translation key

1. Add to **both** `src/shared/locales/fr.js` AND `src/shared/locales/en.js`
2. Use the same key in both files
3. Keys use dot notation: `section.subsection.identifier` (e.g., `"combat.rollAttack"`)
4. Parameterized values use `{paramName}` syntax in the string value

### Language switch mechanism

Changing locale calls `setLocale(value)` → `appElement.innerHTML = getAppTemplate()` → `render(true)`.  
This works because `bindEvents` uses delegation on `appElement` (not on children), so re-setting innerHTML doesn't break listeners.

---

## Naming Conventions

- **All identifiers** (variables, functions, class names, keys, file names) must be in **English**
- File names: `kebab-case.js` (e.g., `damage-parser.js`, `firebase-sync.js`)
- Functions: `camelCase` (e.g., `handleCombatAction`, `renderAttacks`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `ABILITIES`, `DEFAULT_STATE`)
- Data attributes: `data-action="kebab-case"`, `data-field="camelCase"` (existing convention)
- i18n keys: `camelCase.camelCase` dot-separated (e.g., `"roll.advantage"`)
- **Exception**: User-visible text in `locales/fr.js` is in French

---

## Code Style

- Vanilla JS only — no React, Vue, Svelte, TypeScript
- ES modules (`import`/`export`) throughout — no CommonJS
- Template literals for HTML strings (e.g., in `shell.js`, `renderer.js`)
- Async/await for all async operations
- `escapeHtml()` from `shared/dom.js` for any user-provided data in innerHTML
- No inline event handlers in HTML (`onclick=""`) — use `data-action` attributes + delegation
- Comments only where the code is non-obvious — do not comment self-explanatory code
- Prefer early returns over deeply nested `if` blocks

---

## Documentation Rule

**Always update `README.md` at the end of every feature implementation.**

- Add new features to the relevant `## ✨ Features` sub-section (or create a new one)
- Remove or correct any outdated behaviour descriptions
- Update the **Project Structure** and **Architecture** sections if new files or layers were added
- Update the **First Run** section if the user-facing setup flow changed
- Update i18n key count if significantly changed
- Commit the README update in the same PR/commit as the feature, or in an immediate follow-up commit

## Common Pitfalls

1. **Circular imports**: `store.js` ↔ `renderer.js` — solved by `injectRender`. Never import renderer from store.
2. **Shell.js edits**: `getAppTemplate()` is ~500 lines. When editing with `old_str`/`new_str`, always include the full function if replacing large chunks — partial replacements leave orphaned HTML that breaks the Vite/rolldown parser.
3. **Stale `abilityMap` constructs**: When removing an import (e.g., `ABILITIES`), search the file for all uses before deleting. A leftover `const map = new Map(ABILITIES.map(...))` without its import causes `ReferenceError` at runtime.
4. **`commit(false)` vs `commit()`**: Use `commit(false)` when mutating state in response to an input event — `commit()` will sync input values back to DOM and move the cursor to position 0.
5. **`_app` format identifier**: `export const _app = "Compagnon D&D"` in locale files is a format marker for import validation — keep it in French for both locales (it's not displayed).
6. **i18n in `core/`**: It's acceptable to import `t` from `../shared/i18n.js` inside `core/` files (e.g., `core/character.js`). i18n is a shared utility, not a UI concern.

---

## Build & Dev Commands

```bash
npm run dev      # Start Vite dev server on http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

Expected build output: `✓ N modules transformed` with 0 errors, 0 warnings about missing exports.

---

## Adding a New Feature Tab

1. Create `src/features/<name>/handler.js` and `src/features/<name>/renderer.js`
2. Export `handleNameAction(button): boolean` from `handler.js`
3. Export `renderName()` from `renderer.js`
4. Import and add handler to `ACTION_HANDLERS[]` in `app/events.js`
5. Import and call `renderName()` inside `render()` in `app/renderer.js`
6. Add tab button and section in `getAppTemplate()` in `app/shell.js`
7. Add `case "name":` in `switchTab()` in `app/events.js`
8. Add all UI strings to both `src/shared/locales/fr.js` and `en.js`
