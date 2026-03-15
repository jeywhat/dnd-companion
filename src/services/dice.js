import { formatSignedNumber } from "./character.js";

function getCryptoSource() {
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("Le générateur aléatoire sécurisé du navigateur est indisponible.");
  }

  return window.crypto;
}

export function rollDie(sides) {
  const faces = Number.parseInt(sides, 10);

  if (!Number.isFinite(faces) || faces < 2) {
    throw new Error("Le dé demandé est invalide.");
  }

  const randomBytes = new Uint32Array(1);
  const maximumRange = Math.floor(0xffffffff / faces) * faces;
  let candidate = 0xffffffff;

  while (candidate >= maximumRange) {
    getCryptoSource().getRandomValues(randomBytes);
    candidate = randomBytes[0];
  }

  return (candidate % faces) + 1;
}

export function validateD20Result(value) {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error(`Résultat d20 invalide détecté : ${value}`);
  }

  return value;
}

export function rollD20(mode = "normal") {
  if (mode === "advantage" || mode === "disadvantage") {
    const first = validateD20Result(rollDie(20));
    const second = validateD20Result(rollDie(20));
    const selected = mode === "advantage" ? Math.max(first, second) : Math.min(first, second);

    return {
      mode,
      rolls: [first, second],
      selected
    };
  }

  const selected = validateD20Result(rollDie(20));

  return {
    mode: "normal",
    rolls: [selected],
    selected
  };
}

export function buildRollSummary({ label, bonus, mode = "normal" }) {
  const d20 = rollD20(mode);
  const total = d20.selected + bonus;
  const rollDetails =
    d20.rolls.length === 2 ? `${d20.rolls[0]} / ${d20.rolls[1]}` : `${d20.selected}`;

  return {
    label,
    total,
    bonus,
    baseRoll: d20.selected,
    rolls: d20.rolls,
    mode: d20.mode,
    isCritical: d20.selected === 20,
    isFumble: d20.selected === 1,
    breakdown: `${rollDetails} ${bonus === 0 ? "" : ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}`}`.trim(),
    spokenSummary: `${label} : ${total} (${d20.selected} ${bonus === 0 ? "" : `${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}`})`.replace(
      /\s+\)/g,
      ")"
    )
  };
}

export function formatHistoryEntry(entry) {
  const bonus = entry.bonus === 0 ? "sans bonus" : formatSignedNumber(entry.bonus);
  const rollsLabel =
    entry.rolls.length > 1 ? ` (${entry.rolls.join(" / ")})` : ` (${entry.baseRoll})`;

  return `${entry.label} : ${entry.total} ${bonus}${rollsLabel}`;
}
