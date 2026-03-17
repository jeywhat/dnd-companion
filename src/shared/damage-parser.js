/**
 * Parse une chaîne de dégâts (ex: "2d6 + 3 tranchants", "1d8+1d4-1") et retourne
 * un mapping de dés {faces: quantité} et un modificateur fixe.
 * Retourne null si aucun dé ni nombre exploitable n'est trouvé.
 */
export function parseDamageString(damage) {
  if (!damage || typeof damage !== "string") {
    return null;
  }

  const diceMap = {};
  let hasDice = false;

  for (const [, qty, sides] of damage.matchAll(/(\d+)d(\d+)/gi)) {
    const s = parseInt(sides, 10);
    diceMap[s] = (diceMap[s] || 0) + parseInt(qty, 10);
    hasDice = true;
  }

  const stripped = damage.replace(/\d+d\d+/gi, "");
  let flat = 0;

  for (const m of stripped.matchAll(/([+-]?\s*\d+)/g)) {
    flat += parseInt(m[1].replace(/\s/g, ""), 10);
  }

  if (!hasDice && flat === 0) {
    return null;
  }

  return { diceMap, flat, hasDice };
}
