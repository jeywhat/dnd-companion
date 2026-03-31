/**
 * Token factory & merge utilities for the Carte whiteboard.
 *
 * Token structure :
 *   { id, owner, type, x, y, size, name, color, icon }
 *   - size = diameter in world units (= pixels at zoom 1). Default 40.
 *   - owner = PLAYER_ID of the creator
 *   - type = "player" | "monster" | "npc"
 *   - icon = emoji string (e.g. "🧙") or data:image/* URL for custom avatar
 */

import { PLAYER_ID } from "../../adapters/firebase-sync.js";

let _nextId = 1;

const DEFAULT_ICONS = {
  player:  "🧙",
  monster: "👹",
  npc:     "🧑",
};

/**
 * Create a new token at the given world coordinates.
 */
export function createToken({ type = "player", x = 0, y = 0, name = "", size = 40, color = "", icon = "" } = {}) {
  const token = {
    id: `tok-${PLAYER_ID.slice(0, 6)}-${Date.now().toString(36)}-${_nextId++}`,
    owner: PLAYER_ID,
    type,
    x,
    y,
    size,
    name: name || _defaultName(type),
    color,
    icon: icon || DEFAULT_ICONS[type] || "❓",
  };
  console.log("[Tokens] ✅ Created:", token.id, token.type, token.name, token.icon);
  return token;
}

function _defaultName(type) {
  switch (type) {
    case "player":  return "PJ";
    case "monster": return "Monstre";
    case "npc":     return "PNJ";
    default:        return "?";
  }
}

/**
 * Check if the current user can interact with (drag/delete) a given token.
 * GM can interact with ALL tokens. Players can only interact with their own.
 */
export function canInteract(token, role) {
  if (role === "gm") return true;
  return token.owner === PLAYER_ID;
}

/**
 * Merge remote Firebase token snapshot into local array.
 * Remote data takes precedence except for tokens currently being dragged.
 */
export function mergeRemoteTokens(localTokens, remoteData, draggedTokenId = null) {
  if (!remoteData || typeof remoteData !== "object") return localTokens;

  const merged = [];
  for (const [, data] of Object.entries(remoteData)) {
    if (!data || typeof data !== "object" || !data.id) continue;
    // Keep local position if currently dragging this token
    if (data.id === draggedTokenId) {
      const local = localTokens.find((t) => t.id === data.id);
      merged.push(local || data);
    } else {
      merged.push(data);
    }
  }
  return merged;
}
