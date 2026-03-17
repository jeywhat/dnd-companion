// ─── Couleurs Discord ─────────────────────────────────────────────────────────
const COLOR = {
  default:  0x8b5cf6, // violet
  critical: 0xffd700, // or
  fumble:   0xef4444, // rouge
  spell:    0x38bdf8, // bleu
  alert:    0xf97316, // orange
  info:     0x22c55e, // vert
  damage:   0xf97316, // orange
};

function safeField(value, fallback = "—") {
  const str = value != null ? String(value) : "";
  return str.trim().length > 0 ? str : fallback;
}

function ts() {
  return new Date().toISOString();
}

// ─── Génération icône d20 ─────────────────────────────────────────────────────

/**
 * Dessine un d20 stylisé sur un Canvas et retourne un Blob PNG.
 * @param {number} value   Valeur à afficher sur la face du dé.
 * @param {"roll"|"damage"} type  Type de jet (détermine la palette de couleurs).
 */
async function createD20Blob(value, type = "roll") {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2, cy = size / 2;
  const r = 108;

  // Palette selon le type et la valeur
  let fill, border, textColor;
  if (type === "roll") {
    // Palette basée sur le total (peut dépasser 20 avec modificateur)
    if (value <= 1)        { fill = "#991b1b"; border = "#f87171"; textColor = "#fff"; }
    else if (value >= 25)  { fill = "#b45309"; border = "#fcd34d"; textColor = "#fef3c7"; }
    else if (value >= 18)  { fill = "#166534"; border = "#86efac"; textColor = "#f0fdf4"; }
    else if (value >= 12)  { fill = "#3730a3"; border = "#a5b4fc"; textColor = "#eef2ff"; }
    else if (value >= 6)   { fill = "#374151"; border = "#9ca3af"; textColor = "#f9fafb"; }
    else                   { fill = "#7f1d1d"; border = "#fca5a5"; textColor = "#fff"; }
  } else {
    // Dégâts — échelle relative
    if (value <= 3)        { fill = "#374151"; border = "#6b7280"; textColor = "#f9fafb"; }
    else if (value <= 10)  { fill = "#1e3a5f"; border = "#93c5fd"; textColor = "#eff6ff"; }
    else if (value <= 20)  { fill = "#7c2d12"; border = "#fdba74"; textColor = "#fff7ed"; }
    else                   { fill = "#7f1d1d"; border = "#f87171"; textColor = "#fff"; }
  }

  // Ombre portée
  ctx.shadowColor = border;
  ctx.shadowBlur = 18;

  // Corps du d20 : décagone
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * 2 * Math.PI / 10) - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Décoration intérieure : triangle central (face caractéristique du d20)
  const triR = r * 0.52;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI / 3) - Math.PI / 2;
    const x = cx + triR * Math.cos(a);
    const y = cy + triR * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = `${border}55`;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Numéro
  const str = String(value);
  const fontSize = str.length >= 3 ? 62 : str.length === 2 ? 80 : 94;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = textColor;
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, cx, cy + 4);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// ─── Webhook direct ───────────────────────────────────────────────────────────

async function sendViaWebhook(webhookUrl, embeds, content = "") {
  if (!webhookUrl?.startsWith("https://discord.com/api/webhooks/")) {
    throw new Error("URL de webhook Discord invalide ou non configurée.");
  }

  const body = { embeds, allowed_mentions: { parse: [] } };
  if (content?.trim()) body.content = content.trim();

  const res = await fetch(`${webhookUrl}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `Webhook Discord → ${res.status}`);
  }
}

/**
 * Envoie embeds + une image d20 générée en Canvas via multipart/form-data.
 * L'image apparaît en thumbnail dans l'embed Discord.
 */
async function sendViaWebhookWithImage(webhookUrl, embeds, imageBlob, content = "") {
  if (!webhookUrl?.startsWith("https://discord.com/api/webhooks/")) {
    throw new Error("URL de webhook Discord invalide ou non configurée.");
  }

  const filename = "d20.png";
  const payload = {
    embeds: embeds.map((e) => ({ ...e, thumbnail: { url: `attachment://${filename}` } })),
    attachments: [{ id: 0, filename }],
    allowed_mentions: { parse: [] },
  };
  if (content?.trim()) payload.content = content.trim();

  const fd = new FormData();
  fd.append("payload_json", JSON.stringify(payload));
  fd.append("files[0]", imageBlob, filename);

  const res = await fetch(`${webhookUrl}?wait=true`, {
    method: "POST",
    body: fd,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `Webhook Discord → ${res.status}`);
  }
}

/** Envoi silencieux si non configuré ; fallback texte seul si génération image échoue. */
async function notifyWebhook(settings, embeds, content = "") {
  try {
    await sendViaWebhook(settings?.webhookUrl, embeds, content);
  } catch (err) {
    if (!err.message.includes("invalide ou non configurée")) {
      console.warn("[Discord webhook]", err.message);
    }
  }
}

async function notifyWebhookWithImage(settings, embeds, diceValue, diceType = "roll") {
  const webhookUrl = settings?.webhookUrl;
  if (!webhookUrl?.startsWith("https://discord.com/api/webhooks/")) return;
  try {
    const blob = await createD20Blob(diceValue, diceType);
    await sendViaWebhookWithImage(webhookUrl, embeds, blob);
  } catch (err) {
    console.warn("[Discord webhook + image]", err.message);
    // Fallback sans image
    await notifyWebhook(settings, embeds);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function modeLabel(mode) {
  return mode === "advantage" ? "Avantage ⬆️" : mode === "disadvantage" ? "Désavantage ⬇️" : "Normal";
}

// ─── Exports publics ──────────────────────────────────────────────────────────

export async function sendRollWebhook(settings, payload) {
  const color = payload.isCritical ? COLOR.critical : payload.isFumble ? COLOR.fumble : COLOR.default;
  const signedBonus = `${payload.bonus >= 0 ? "+" : ""}${payload.bonus ?? 0}`;
  const title = payload.isCritical
    ? `💥 CRITIQUE — ${safeField(payload.label, "Jet")}`
    : payload.isFumble
      ? `💀 ÉCHEC CRITIQUE — ${safeField(payload.label, "Jet")}`
      : `🎲 ${safeField(payload.label, "Jet")}`;

  const rollsValue = Array.isArray(payload.rolls) && payload.rolls.length > 0
    ? payload.rolls.join(" / ")
    : String(payload.baseRoll ?? "?");

  // L'icône d20 affiche le total final (après modificateur)
  await notifyWebhookWithImage(settings, [{
    title,
    description: `**${payload.total ?? "?"}** *(dé : ${payload.baseRoll ?? "?"} ${signedBonus})*`,
    color,
    author: { name: safeField(payload.characterName, "Aventurier") },
    fields: [
      { name: "Mode",  value: safeField(modeLabel(payload.mode)), inline: true },
      { name: "d20",   value: rollsValue,                          inline: true },
      { name: "Bonus", value: signedBonus,                         inline: true },
    ],
    footer: { text: "Compagnon D&D" },
    timestamp: ts(),
  }], payload.total ?? 1, "roll");
}

export async function sendDamageWebhook(settings, payload) {
  const diceDesc = Object.entries(payload.diceMap ?? {})
    .map(([sides, count]) => `${count}d${sides}`)
    .join(" + ");
  const bonusStr = payload.flat ? ` + ${payload.flat}` : "";

  // L'icône d20 affiche le total des dégâts
  await notifyWebhookWithImage(settings, [{
    title: `⚔️ Dégâts — ${safeField(payload.label, "Attaque")}`,
    description: `**${payload.total ?? "?"}** *(${diceDesc || "dés"}${bonusStr})*`,
    color: COLOR.damage,
    author: { name: safeField(payload.characterName, "Aventurier") },
    footer: { text: "Compagnon D&D" },
    timestamp: ts(),
  }], payload.total ?? 1, "damage");
}

export async function sendSpellWebhook(settings, payload) {
  const fields = [
    { name: "Emplacement dépensé", value: safeField(payload.spell?.slotCost, "?"), inline: true },
  ];

  if (payload.slotsRemaining != null) {
    fields.push({ name: "Restants", value: String(payload.slotsRemaining), inline: true });
  }

  if (payload.spell?.damage) {
    fields.push({ name: "Dégâts", value: safeField(payload.spell.damage, "—"), inline: false });
  }

  fields.push({ name: "Note", value: safeField(payload.spell?.note, "Aucune"), inline: false });

  await notifyWebhook(settings, [{
    title: `✨ Sort — ${safeField(payload.spell?.name, "Sort")}`,
    description: `**${safeField(payload.characterName, "Le personnage")}** lance **${safeField(payload.spell?.name, "Sort")}** (Niveau ${payload.spell?.level ?? "?"})`,
    color: COLOR.spell,
    author: { name: safeField(payload.characterName, "Aventurier") },
    fields,
    footer: { text: "Compagnon D&D" },
    timestamp: ts(),
  }]);
}

export async function sendHpWebhook(settings, payload) {
  const isDamage = payload.delta < 0;
  const absChange = Math.abs(payload.delta);

  await notifyWebhook(settings, [{
    title: isDamage
      ? `🩸 Dégâts — ${safeField(payload.characterName, "Aventurier")}`
      : `💚 Soin — ${safeField(payload.characterName, "Aventurier")}`,
    description: `**${payload.from}** → **${payload.to}** / ${payload.max} PV`,
    color: isDamage ? COLOR.fumble : COLOR.info,
    author: { name: safeField(payload.characterName, "Aventurier") },
    fields: [
      { name: isDamage ? "Dégâts subis" : "Soins reçus", value: `${isDamage ? "−" : "+"}${absChange}`, inline: true },
      { name: "PV restants", value: `${payload.to} / ${payload.max}`, inline: true },
    ],
    footer: { text: "Compagnon D&D" },
    timestamp: ts(),
  }]);
}

export async function sendFreeDiceWebhook(settings, payload) {
  const rollsDesc = (payload.rolls ?? [])
    .map((r) => `${r.value} (d${r.sides})`)
    .join(", ");

  // Utilise le total comme valeur sur le d20 (peut dépasser 20)
  await notifyWebhookWithImage(settings, [{
    title: `🎲 Dés libres — ${safeField(payload.notation, "Jet")}`,
    description: `**${payload.total ?? "?"}**${rollsDesc ? ` *(${rollsDesc})*` : ""}`,
    color: COLOR.default,
    author: { name: safeField(payload.characterName, "Aventurier") },
    footer: { text: "Compagnon D&D" },
    timestamp: ts(),
  }], payload.total ?? 1, "damage");
}

export async function sendAlertWebhook(settings, payload) {
  const fields = (payload.changes ?? []).map((c) => ({
    name: safeField(c.label, "Champ"),
    value: `${safeField(c.from, "?")} → ${safeField(c.to, "?")}`,
    inline: false,
  }));

  await notifyWebhook(settings, [{
    title: "⚠️ Alerte Anti-Triche",
    description: `**${safeField(payload.characterName, "Un joueur")}** a modifié des statistiques verrouillées.`,
    color: COLOR.alert,
    fields: fields.length > 0 ? fields : [{ name: "Détail", value: "Aucune information disponible.", inline: false }],
    footer: {
      text: safeField(
        payload.source === "storage" ? "Source : stockage local" : "Source : session active",
        "Compagnon D&D"
      ),
    },
    timestamp: ts(),
  }]);
}

export async function sendTestWebhook(settings, characterName) {
  // Lève une erreur si le webhook n'est pas configuré (pour feedback UI)
  await sendViaWebhook(settings?.webhookUrl, [{
    title: "✅ Webhook Discord opérationnel",
    description: `Les notifications de **${characterName || "votre personnage"}** sont bien configurées.`,
    color: COLOR.info,
    footer: { text: "Compagnon D&D" },
    timestamp: ts(),
  }]);
}
