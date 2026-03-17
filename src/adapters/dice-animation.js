import DiceBox from "@3d-dice/dice-box";
import { rollDie } from "../core/dice.js";

const NOTATION = { 4: "1d4", 6: "1d6", 8: "1d8", 10: "1d10", 12: "1d12", 20: "1d20" };

let box = null;
let initPromise = null;
let dismissCallback = null;
let autoTimer = null;
let _pendingOverride = null;

// ─── Container ────────────────────────────────────────────────────────────────

function ensureContainer() {
  let el = document.getElementById("dice-box");

  if (!el) {
    el = document.createElement("div");
    el.id = "dice-box";
    document.body.appendChild(el);
  }

  return el;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initDiceBox() {
  if (box) {
    return box;
  }

  if (initPromise) {
    return initPromise;
  }

  ensureContainer();

  const instance = new DiceBox({
    container: "#dice-box",
    assetPath: "/assets/dice-box/",
    gravity: 1,
    mass: 1,
    friction: 0.8,
    restitution: 0.25,
    angularDamping: 0.4,
    linearDamping: 0.5,
    spinForce: 6,
    throwForce: 5,
    startingHeight: 8,
    settleTimeout: 5000,
    offscreen: true,
    enableShadows: true,
    theme: "default",
    themeColor: "#7c3aed"
  });

  initPromise = instance.init().then(() => {
    box = instance;
    return box;
  }).catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

export function preloadDiceBox() {
  setTimeout(() => {
    initDiceBox().catch((err) => {
      console.warn("[DiceBox] Préchargement échoué :", err?.message ?? err);
    });
  }, 1500);
}

// ─── Overlay résultat ─────────────────────────────────────────────────────────

function buildSimpleResultHTML(sides, result, isCritical, isFumble) {
  let badge = "";

  if (isCritical) {
    badge = `<span class="dice-badge dice-badge--crit">CRITIQUE !</span>`;
  } else if (isFumble) {
    badge = `<span class="dice-badge dice-badge--fumble">ÉCHEC CRITIQUE</span>`;
  }

  return `
    <div class="dice-result-inner">
      ${badge}
      <span class="dice-result-number${isCritical ? " dice-result-number--crit" : isFumble ? " dice-result-number--fumble" : ""}">${result}</span>
      <span class="dice-result-label">d${sides}</span>
    </div>
    <p class="dice-result-hint">Appuyez pour continuer</p>
  `;
}

function buildRollResultHTML(sides, baseRoll, rolls, isCritical, isFumble, bonus, rollLabel) {
  const total = baseRoll + bonus;

  let badge = "";

  if (isCritical) {
    badge = `<span class="dice-badge dice-badge--crit">CRITIQUE !</span>`;
  } else if (isFumble) {
    badge = `<span class="dice-badge dice-badge--fumble">ÉCHEC CRITIQUE</span>`;
  }

  const dieChips = rolls.map((v) => {
    const isSelected = v === baseRoll;
    const dimmed = rolls.length > 1 && !isSelected ? " dice-chip--dimmed" : "";
    const special = isCritical && isSelected ? " dice-chip--crit" : isFumble && isSelected ? " dice-chip--fumble" : "";

    return `
      <div class="dice-chip${dimmed}${special}">
        <span class="dice-chip-value">${v}</span>
        <span class="dice-chip-label">d${sides}</span>
      </div>
    `;
  }).join("");

  const bonusChip = bonus !== 0
    ? `<div class="dice-flat-modifier">${bonus > 0 ? "+" : ""}${bonus}</div>`
    : "";

  const totalClass = isCritical
    ? " dice-multi-total-value--crit"
    : isFumble
      ? " dice-multi-total-value--fumble"
      : "";

  const labelHTML = rollLabel
    ? `<p class="dice-roll-label">${rollLabel}</p>`
    : "";

  return `
    <div class="dice-result-inner">
      ${badge}
      <div class="dice-chip-row">${dieChips}${bonusChip}</div>
      <div class="dice-multi-total">
        <span class="dice-multi-total-label">Total</span>
        <span class="dice-multi-total-value${totalClass}">${total}</span>
      </div>
      ${labelHTML}
    </div>
    <p class="dice-result-hint">Appuyez pour continuer</p>
  `;
}

function showResultOverlay(container, sides, baseRoll, rolls, isCritical, isFumble, bonus = 0, rollLabel = "") {
  let panel = container.querySelector(".dice-result-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "dice-result-panel";
    container.appendChild(panel);
  }

  const useRichFormat = bonus !== 0 || rolls.length > 1;

  panel.innerHTML = useRichFormat
    ? buildRollResultHTML(sides, baseRoll, rolls, isCritical, isFumble, bonus, rollLabel)
    : buildSimpleResultHTML(sides, baseRoll, isCritical, isFumble);

  panel.getBoundingClientRect();
  panel.classList.add("dice-result-panel--visible");
}

function clearOverlay(container) {
  container.classList.remove("dice-box--active", "dice-box--remote");

  const panel = container.querySelector(".dice-result-panel");

  if (panel) {
    panel.classList.remove("dice-result-panel--visible");
  }

  setTimeout(() => {
    if (box) {
      box.clear();
    }
  }, 300);
}

// ─── Fallback crypto ──────────────────────────────────────────────────────────

function cryptoFallback(sides, rollMode) {
  const use2dice = sides === 20 && rollMode !== "normal";

  if (use2dice) {
    const v1 = rollDie(20);
    const v2 = rollDie(20);
    const rolls = [v1, v2];
    const baseRoll = rollMode === "advantage" ? Math.max(v1, v2) : Math.min(v1, v2);

    return { baseRoll, rolls };
  }

  const baseRoll = rollDie(sides);

  return { baseRoll, rolls: [baseRoll] };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Génère des valeurs de dés pour un diceMap AVANT animation.
 * @param {Object} diceMap  ex: { 6: 2, 8: 1 }
 * @returns {Array<{sides: number, value: number}>}
 */
export function rollDiceValues(diceMap) {
  const rolls = [];
  for (const [sidesStr, qty] of Object.entries(diceMap)) {
    const sides = Number(sidesStr);
    for (let i = 0; i < qty; i++) {
      rolls.push({ sides, value: rollDie(sides) });
    }
  }
  return rolls;
}

export async function triggerDiceAnimation(sides, rollMode = "normal", bonus = 0, rollLabel = "", themeColor = "#7c3aed") {
  if (dismissCallback) {
    dismissCallback();
  }

  const container = ensureContainer();
  container.classList.add("dice-box--active");

  const oldPanel = container.querySelector(".dice-result-panel");

  if (oldPanel) {
    oldPanel.remove();
  }

  const dismiss = () => {
    clearOverlay(container);
    container.removeEventListener("click", dismiss);

    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }

    dismissCallback = null;
  };

  dismissCallback = dismiss;

  const use2dice = sides === 20 && rollMode !== "normal";
  const diceConfig = use2dice
    ? [{ qty: 1, sides, themeColor }, { qty: 1, sides, themeColor }]
    : [{ qty: 1, sides, themeColor }];

  let baseRoll, rolls;

  try {
    const diceBox = await initDiceBox();

    diceBox.clear();

    const raw = await diceBox.roll(diceConfig);
    const values = (Array.isArray(raw) ? raw : [raw]).map((r) => r.value);

    if (use2dice && rollMode === "advantage") baseRoll = Math.max(...values);
    else if (use2dice && rollMode === "disadvantage") baseRoll = Math.min(...values);
    else baseRoll = values[0];

    rolls = values;
  } catch (err) {
    console.warn("[DiceBox] Fallback crypto RNG :", err?.message ?? err);
    ({ baseRoll, rolls } = cryptoFallback(sides, rollMode));
  }

  const isCritical = sides === 20 && baseRoll === 20;
  const isFumble = sides === 20 && baseRoll === 1;

  showResultOverlay(container, sides, baseRoll, rolls, isCritical, isFumble, bonus, rollLabel);
  container.addEventListener("click", dismiss, { once: true });
  autoTimer = setTimeout(dismiss, 5000);

  return { baseRoll, rolls, mode: rollMode };
}

// ─── Multi-dice overlay ───────────────────────────────────────────────────────

function buildMultiResultHTML(diceRolls, total, flatModifier = 0) {
  if (diceRolls.length === 0) {
    return `
      <div class="dice-multi-inner">
        <div class="dice-multi-total">
          <span class="dice-multi-total-label">Total</span>
          <span class="dice-multi-total-value">${total}</span>
        </div>
      </div>
      <p class="dice-result-hint">Appuyez pour continuer</p>
    `;
  }

  const chips = diceRolls.map(({ sides, value }) => `
    <div class="dice-chip">
      <span class="dice-chip-value">${value}</span>
      <span class="dice-chip-label">d${sides}</span>
    </div>
  `).join("");

  const modifierChip = flatModifier !== 0
    ? `<div class="dice-flat-modifier">${flatModifier > 0 ? "+" : ""}${flatModifier}</div>`
    : "";

  return `
    <div class="dice-multi-inner">
      <div class="dice-chip-row">${chips}${modifierChip}</div>
      <div class="dice-multi-total">
        <span class="dice-multi-total-label">Total</span>
        <span class="dice-multi-total-value">${total}</span>
      </div>
    </div>
    <p class="dice-result-hint">Appuyez pour continuer</p>
  `;
}

function showMultiResultOverlay(container, diceRolls, total, flatModifier = 0) {
  let panel = container.querySelector(".dice-result-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "dice-result-panel";
    container.appendChild(panel);
  }

  panel.innerHTML = buildMultiResultHTML(diceRolls, total, flatModifier);
  panel.getBoundingClientRect();
  panel.classList.add("dice-result-panel--visible");
}

/**
 * Lance une combinaison de dés en physique 3D et retourne tous les résultats.
 *
 * @param  {Record<number,number>} diceMap
 * @param  {number}               flatModifier
 * @param  {Array<{sides,value}>|null} overrideRolls
 * @param  {string}               [themeColor]
 * @param  {boolean}              [isRemote]
 * @returns {Promise<{ rolls: Array<{sides,value}>, total: number, notation: string }>}
 */
export async function triggerMultiDiceAnimation(diceMap, flatModifier = 0, overrideRolls = null, themeColor = "#7c3aed", isRemote = false) {
  if (dismissCallback) {
    dismissCallback();
  }

  const container = ensureContainer();
  container.classList.add("dice-box--active");
  if (isRemote) {
    container.classList.add("dice-box--remote");
  }

  const oldPanel = container.querySelector(".dice-result-panel");

  if (oldPanel) {
    oldPanel.remove();
  }

  const dismiss = () => {
    clearOverlay(container);
    container.removeEventListener("click", dismiss);

    if (autoTimer) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }

    dismissCallback = null;
  };

  dismissCallback = dismiss;

  const diceConfigs = Object.entries(diceMap)
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
    .flatMap(([sides, qty]) => {
      const s = Number(sides);
      return Array.from({ length: qty }, () => ({ qty: 1, sides: s, themeColor }));
    });

  const notation = diceConfigs.map(c => `${c.qty}d${c.sides}`).join(" + ");

  let diceRolls = [];
  let diceTotal = 0;

  try {
    const diceBox = await initDiceBox();

    diceBox.clear();

    if (diceConfigs.length > 0) {
      const raw = await diceBox.roll(diceConfigs);
      const results = Array.isArray(raw) ? raw : [raw];

      diceRolls = results.map((r) => ({ sides: Number(r.sides), value: r.value }));
    }

    diceTotal = diceRolls.reduce((sum, r) => sum + r.value, 0);
  } catch (err) {
    console.warn("[DiceBox] Fallback multi-dés crypto RNG :", err?.message ?? err);

    for (const [sidesStr, qty] of Object.entries(diceMap)) {
      const sides = Number(sidesStr);

      for (let i = 0; i < qty; i++) {
        const value = rollDie(sides);
        diceRolls.push({ sides, value });
        diceTotal += value;
      }
    }
  }

  const total = diceTotal + flatModifier;

  let displayRolls, displayTotal, displayFlat;
  if (_pendingOverride) {
    ({ rolls: displayRolls, total: displayTotal, flatModifier: displayFlat } = _pendingOverride);
    _pendingOverride = null;
  } else if (overrideRolls) {
    displayRolls = overrideRolls;
    displayTotal = overrideRolls.reduce((s, r) => s + r.value, 0) + flatModifier;
    displayFlat  = flatModifier;
  } else {
    displayRolls = diceRolls;
    displayTotal = total;
    displayFlat  = flatModifier;
  }

  showMultiResultOverlay(container, displayRolls, displayTotal, displayFlat);

  if (isRemote) {
    autoTimer = setTimeout(dismiss, 30_000);
  } else {
    container.addEventListener("click", dismiss, { once: true });
    autoTimer = setTimeout(dismiss, 6000);
  }

  return { rolls: displayRolls, total: displayTotal, notation };
}

/**
 * Applique les résultats exacts d'un jet distant.
 */
export function applyPendingOverride(rolls, total, flatModifier = 0) {
  const panel = document.getElementById("dice-box")
    ?.querySelector(".dice-result-panel--visible");

  if (panel) {
    panel.innerHTML = buildMultiResultHTML(rolls, total, flatModifier);
    return;
  }

  if (dismissCallback) {
    _pendingOverride = { rolls, total, flatModifier };
  }
}

export function dismissCurrentAnimation() {
  dismissCallback?.();
}
