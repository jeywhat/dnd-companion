import { state, setStatus, commit, getCharacterName, resetToDefault } from "../../app/store.js";
import { saveState, sanitiseState } from "../../adapters/storage.js";
import { sendTestWebhook } from "../../adapters/discord.js";
import { connectSync, disconnectSync, publishRoll } from "../../adapters/firebase-sync.js";
import { createSessionBaseline } from "../../adapters/anti-cheat.js";
import { restoreLockedCharacter, toInt } from "../../core/character.js";
import { connectParty, disconnectParty } from "../party/handler.js";
import { t } from "../../shared/i18n.js";

// ─── Firebase sync reconnect ──────────────────────────────────────────────────

export function reconnectSync() {
  disconnectSync();
  disconnectParty();
  connectSync({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
    onRoll     : handleRemoteRoll,
  });
  connectParty({
    firebaseUrl: state.settings.firebaseUrl,
    roomId     : state.settings.syncRoom,
  });
}

// ─── URL param bootstrap ──────────────────────────────────────────────────────

export function applyWebhookFromUrl() {
  const params = new URLSearchParams(window.location.search);
  let anyChanged = false;
  const messages = [];

  const wh = params.get("wh");
  if (wh) {
    const decoded = decodeURIComponent(wh);
    if (decoded.startsWith("https://discord.com/api/webhooks/")) {
      state.settings.webhookUrl = decoded;
      messages.push(t("config.webhook"));
      anyChanged = true;
    }
    params.delete("wh");
  }

  const fb = params.get("fb");
  if (fb) {
    state.settings.firebaseUrl = decodeURIComponent(fb);
    messages.push(t("config.firebase"));
    anyChanged = true;
    params.delete("fb");
  }

  const room = params.get("room");
  if (room) {
    state.settings.syncRoom = decodeURIComponent(room);
    messages.push(t("config.room", { name: room }));
    anyChanged = true;
    params.delete("room");
  }

  if (anyChanged) {
    saveState(state);
    const clean = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;
    history.replaceState(null, "", clean);
    window.setTimeout(() => {
      setStatus("success", t("status.configuredFromUrl", { items: messages.join(", ") }));
    }, 200);
  }
}

// ─── Action handler ───────────────────────────────────────────────────────────

/** @returns {boolean} true if handled */
export async function handleSettingsAction(button) {
  const { action } = button.dataset;

  if (action === "toggle-lock") {
    if (state.sessionLock.isLocked) {
      state.sessionLock.isLocked = false;
      state.sessionLock.baseline = null;
      setStatus("info", t("status.sessionUnlocked"));
    } else {
      state.sessionLock.isLocked = true;
      state.sessionLock.baseline = createSessionBaseline(state.character);
      setStatus("success", t("status.sessionLocked"));
    }
    commit(false);
    return true;
  }

  if (action === "test-discord") {
    try {
      await sendTestWebhook(state.settings, getCharacterName());
      setStatus("success", t("status.discordTestSuccess"));
      commit(false);
    } catch (error) {
      setStatus("error", t("status.discordFailed", { error: error.message }));
      commit(false);
    }
    return true;
  }

  if (action === "test-sync") {
    if (!state.settings.firebaseUrl || !state.settings.syncRoom) {
      setStatus("error", t("status.syncNotConfigured"));
      return true;
    }
    try {
      await publishRoll({
        firebaseUrl: state.settings.firebaseUrl,
        roomId     : state.settings.syncRoom,
        roll: {
          type         : "damage",
          characterName: getCharacterName() || "Test",
          label        : t("roll.syncTestLabel"),
          diceMap      : { 6: 2 },
          flat         : 0,
          total        : 7,
        },
      });
      setStatus("success", t("status.syncTestSuccess"));
    } catch (err) {
      setStatus("error", t("status.syncFailed", { error: err.message }));
    }
    return true;
  }

  if (action === "export-character") {
    const payload = {
      _version: 1,
      _app: "Compagnon D&D",
      _exportedAt: new Date().toISOString(),
      character: state.character
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const charName = (state.character.name || "personnage").replace(/\s+/g, "-").toLowerCase();
    const a = document.createElement("a");
    a.href = url;
    a.download = `${charName}-dnd.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("success", t("status.exportSuccess"));
    return true;
  }

  if (action === "import-character") {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (data._app !== "Compagnon D&D" || !data.character || typeof data.character !== "object") {
          throw new Error(t("error.importInvalidFile"));
        }

        const charName = data.character.name || t("app.defaultCharName");
        const charClass = data.character.className || t("app.defaultClass");
        const charLevel = data.character.level ?? "?";

        const confirmed = window.confirm(
          t("confirm.import", { name: charName, class: charClass, level: charLevel })
        );

        if (!confirmed) return;

        const sanitised = sanitiseState({ character: data.character });
        state.character = sanitised.character;

        setStatus("success", t("status.importSuccess", { name: charName }));
        commit(true);
      } catch (err) {
        setStatus("error", t("error.importFailed", { error: err.message }));
        commit(false);
      }
    });

    fileInput.click();
    return true;
  }

  if (action === "reset-app") {
    const confirmed = window.confirm(t("confirm.reset"));

    if (!confirmed) return true;

    resetToDefault();
    setStatus("info", t("status.appReset"));
    commit(true);
    return true;
  }

  return false;
}

/** Handle input events for settings feature. @returns {boolean} */
export function handleSettingsInput(target) {
  if (target.matches("[data-setting-field]")) {
    state.settings[target.dataset.settingField] = target.value.trim();
    setStatus("info", t("status.settingSaved"));
    commit(true);

    if (target.dataset.settingField === "firebaseUrl" || target.dataset.settingField === "syncRoom") {
      reconnectSync();
    }
    return true;
  }
  return false;
}

// ─── Remote roll popup (Firebase sync UI) ────────────────────────────────────

let _remoteBannerTimer = null;
const _remotePopups = new Map();

function showRemoteBanner(text) {
  const banner = document.getElementById("remote-roll-banner");
  const textEl = document.getElementById("remote-roll-banner-text");
  if (!banner || !textEl) return;

  textEl.textContent = text;
  banner.hidden = false;
  banner.classList.add("remote-banner-in");

  window.clearTimeout(_remoteBannerTimer);
  _remoteBannerTimer = window.setTimeout(() => {
    banner.hidden = true;
    banner.classList.remove("remote-banner-in");
  }, 4000);
}

function _rpopStack() {
  let s = document.getElementById("rpop-stack");
  if (!s) { s = document.createElement("div"); s.id = "rpop-stack"; document.body.appendChild(s); }
  return s;
}

function _rpopDismissAfter(playerKey, ms) {
  const entry = _remotePopups.get(playerKey);
  if (!entry) return;
  window.clearTimeout(entry.timer);
  entry.timer = window.setTimeout(() => {
    const e = _remotePopups.get(playerKey);
    if (e?.el) {
      e.el.classList.add("rpop--exit");
      window.setTimeout(() => { e.el?.remove(); _remotePopups.delete(playerKey); }, 400);
    }
  }, ms);
}

const _DIE_SHAPES = {
  4:  { e: "polygon", a: 'points="50,5 93,88 7,88"',                          ny: 61, ly: 79 },
  6:  { e: "rect",    a: 'x="8" y="8" width="84" height="84" rx="10"',         ny: 50, ly: 72 },
  8:  { e: "polygon", a: 'points="50,5 93,50 50,95 7,50"',                     ny: 50, ly: 73 },
  10: { e: "polygon", a: 'points="50,3 90,40 78,93 22,93 10,40"',              ny: 54, ly: 77 },
  12: { e: "polygon", a: 'points="50,5 93,63 76,87 24,87 7,63"',               ny: 52, ly: 76 },
  20: { e: "polygon", a: 'points="50,5 89,27 89,73 50,95 11,73 11,27"',        ny: 50, ly: 76 },
};

function _buildDieSVG(sides) {
  const s = _DIE_SHAPES[sides] || _DIE_SHAPES[6];
  const lbl = sides > 9 ? 11 : 13;
  return `<div class="rpop-slot" data-sides="${sides}">
    <svg class="rpop-die-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <${s.e} class="rpop-die-shape" ${s.a}/>
      <text class="rpop-die-val" x="50" y="${s.ny}" font-size="30" dominant-baseline="central" text-anchor="middle">?</text>
      <text class="rpop-die-lbl" x="50" y="${s.ly}" font-size="${lbl}" dominant-baseline="central" text-anchor="middle">d${sides}</text>
    </svg>
  </div>`;
}

function _buildResultContent(roll, isCritical = false, isFumble = false) {
  const rolls = roll.rolls ?? [];
  const flat  = roll.flat ?? 0;
  const chips = rolls.map((r) => `
    <div class="rpop-chip">
      <span class="rpop-chip-value">${r.value}</span>
      <span class="rpop-chip-sides">d${r.sides}</span>
    </div>`).join("");
  const flatChip = flat !== 0
    ? `<div class="rpop-chip rpop-chip--flat"><span class="rpop-chip-value">${flat > 0 ? "+" : ""}${flat}</span></div>`
    : "";
  const badge = isCritical
    ? `<div class="rpop-special rpop-special--crit"><span class="rpop-special-stars">✦</span> ${t("popup.critText")} <span class="rpop-special-stars">✦</span></div>`
    : isFumble
    ? `<div class="rpop-special rpop-special--fumble">💀 ${t("popup.fumbleText")} 💀</div>`
    : "";
  const totalClass = isCritical ? " rpop-total--crit" : isFumble ? " rpop-total--fumble" : "";
  return `
    <div class="rpop-meta">
      <span class="rpop-name">${roll.characterName || t("popup.defaultName")}</span>
      <span class="rpop-label">${roll.label || t("popup.defaultLabel")}</span>
    </div>
    ${badge}
    <div class="rpop-chips">${chips}${flatChip}</div>
    <div class="rpop-total${totalClass}">${roll.total ?? "?"}</div>`;
}

function handleRemoteRoll(roll) {
  const color   = roll.diceColor || "#7c3aed";
  const name    = roll.characterName || t("popup.defaultName");
  const label   = roll.label || t("popup.defaultRollLabel");
  const diceMap = roll.diceMap || {};
  const pkey    = name;

  if (!roll.rolls) {
    showRemoteBanner(t("popup.rolling", { name, label }));

    const existing = _remotePopups.get(pkey);
    if (existing) {
      window.clearTimeout(existing.timer);
      clearInterval(existing.interval);
      existing.el?.remove();
    }

    const diceList = Object.entries(diceMap)
      .filter(([, q]) => q > 0)
      .sort(([a], [b]) => Number(b) - Number(a))
      .flatMap(([s, q]) => Array.from({ length: q }, () => Number(s)));

    const flat = roll.flat ?? 0;
    const flatHTML = flat !== 0
      ? `<div class="rpop-slot rpop-slot--flat">
           <span class="rpop-slot-flat">${flat > 0 ? "+" : ""}${flat}</span>
         </div>`
      : "";

    const popup = document.createElement("div");
    popup.className = "rpop";
    popup.style.setProperty("--rpop-color", color);
    popup.innerHTML = `
      <div class="rpop-meta">
        <span class="rpop-name">${name}</span>
        <span class="rpop-label">${label}</span>
      </div>
      <div class="rpop-slots">${diceList.map(s => _buildDieSVG(s)).join("")}${flatHTML}</div>`;
    _rpopStack().appendChild(popup);

    let interval = null;
    if (diceList.length > 0) {
      const valEls = [...popup.querySelectorAll(".rpop-die-val")];
      interval = setInterval(() => {
        valEls.forEach((el, i) => {
          const v = Math.floor(Math.random() * diceList[i]) + 1;
          el.textContent = v;
          el.setAttribute("font-size", v >= 10 ? "24" : "30");
        });
      }, 75);
    }

    _remotePopups.set(pkey, { el: popup, timer: null, interval, diceList });

  } else {
    showRemoteBanner(t("popup.result", { name, label, total: roll.total ?? "?" }));

    const entry = _remotePopups.get(pkey);
    if (entry) { clearInterval(entry.interval); entry.interval = null; }

    const flat = roll.flat ?? 0;
    const baseRoll = (roll.total ?? 0) - flat;
    const isCritical = roll.type === "d20" && baseRoll === 20;
    const isFumble   = roll.type === "d20" && baseRoll === 1;
    const finalColor = isCritical ? "#fbbf24" : isFumble ? "#ef4444" : color;

    const overrideRolls = roll.rolls.map(r => ({ sides: Number(r.sides), value: Number(r.value) }));

    const popup = entry?.el ?? null;
    const valEls = popup ? [...popup.querySelectorAll(".rpop-die-val")] : [];

    const _finalizePopup = (p) => {
      p.style.setProperty("--rpop-color", finalColor);
      if (isCritical) p.classList.add("rpop--critical");
      else if (isFumble) p.classList.add("rpop--fumble");

      if (isCritical || isFumble) {
        const badge = document.createElement("div");
        badge.className = `rpop-special rpop-special--${isCritical ? "crit" : "fumble"}`;
        badge.innerHTML = isCritical
          ? `<span class="rpop-special-stars">✦</span> ${t("popup.critText")} <span class="rpop-special-stars">✦</span>`
          : `💀 ${t("popup.fumbleText")} 💀`;
        p.querySelector(".rpop-slots")?.before(badge);
      }

      const totalDelay = isCritical || isFumble ? 500 : 0;
      window.setTimeout(() => {
        const totalEl = document.createElement("div");
        totalEl.className = `rpop-total${isCritical ? " rpop-total--crit" : isFumble ? " rpop-total--fumble" : ""}`;
        totalEl.textContent = roll.total ?? "?";
        p.appendChild(totalEl);
        _rpopDismissAfter(pkey, isCritical || isFumble ? 7000 : 5000);
      }, totalDelay);
    };

    if (popup && valEls.length > 0) {
      overrideRolls.forEach((r, i) => {
        window.setTimeout(() => {
          const el = valEls[i];
          if (el) {
            el.textContent = r.value;
            el.setAttribute("font-size", r.value >= 10 ? "24" : "30");
            el.closest(".rpop-slot")?.classList.add("rpop-slot--locked");
          }
          if (i === overrideRolls.length - 1) {
            window.setTimeout(() => _finalizePopup(popup), 380);
          }
        }, i * 160);
      });
    } else if (popup) {
      _finalizePopup(popup);
    } else {
      const p = document.createElement("div");
      p.className = `rpop${isCritical ? " rpop--critical" : isFumble ? " rpop--fumble" : ""}`;
      p.style.setProperty("--rpop-color", finalColor);
      p.innerHTML = _buildResultContent(roll, isCritical, isFumble);
      _rpopStack().appendChild(p);
      _remotePopups.set(pkey, { el: p, timer: null, interval: null, diceList: [] });
      _rpopDismissAfter(pkey, isCritical || isFumble ? 7000 : 5000);
    }
  }
}
