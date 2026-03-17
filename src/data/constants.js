export const STORAGE_KEY = "compagnon-dnd-state";
export const HISTORY_LIMIT = 8;

export const ABILITIES = [
  { key: "strength", short: "FOR", label: "Force" },
  { key: "dexterity", short: "DEX", label: "Dextérité" },
  { key: "constitution", short: "CON", label: "Constitution" },
  { key: "intelligence", short: "INT", label: "Intelligence" },
  { key: "wisdom", short: "SAG", label: "Sagesse" },
  { key: "charisma", short: "CHA", label: "Charisme" }
];

export const SKILLS = [
  { key: "acrobatics", label: "Acrobaties", ability: "dexterity" },
  { key: "animalHandling", label: "Dressage", ability: "wisdom" },
  { key: "arcana", label: "Arcanes", ability: "intelligence" },
  { key: "athletics", label: "Athlétisme", ability: "strength" },
  { key: "deception", label: "Tromperie", ability: "charisma" },
  { key: "history", label: "Histoire", ability: "intelligence" },
  { key: "insight", label: "Perspicacité", ability: "wisdom" },
  { key: "intimidation", label: "Intimidation", ability: "charisma" },
  { key: "investigation", label: "Investigation", ability: "intelligence" },
  { key: "medicine", label: "Médecine", ability: "wisdom" },
  { key: "nature", label: "Nature", ability: "intelligence" },
  { key: "perception", label: "Perception", ability: "wisdom" },
  { key: "performance", label: "Représentation", ability: "charisma" },
  { key: "persuasion", label: "Persuasion", ability: "charisma" },
  { key: "religion", label: "Religion", ability: "intelligence" },
  { key: "sleightOfHand", label: "Escamotage", ability: "dexterity" },
  { key: "stealth", label: "Discrétion", ability: "dexterity" },
  { key: "survival", label: "Survie", ability: "wisdom" }
];

export const ROLL_MODES = [
  { key: "normal", label: "Normal" },
  { key: "advantage", label: "Avantage" },
  { key: "disadvantage", label: "Désavantage" }
];

export const DISCORD_COLORS = {
  default: 0x8b5cf6,
  critical: 0x22c55e,
  fumble: 0xef4444,
  spell: 0x38bdf8,
  alert: 0xf59e0b,
  info: 0x94a3b8
};

export function createDefaultAbilities() {
  return ABILITIES.reduce((accumulator, ability) => {
    accumulator[ability.key] = 10;
    return accumulator;
  }, {});
}

export function createDefaultState() {
  return {
    character: {
      name: "",
      className: "",
      avatar: "",
      level: 1,
      abilities: createDefaultAbilities(),
      hpMax: 10,
      currentHp: 10,
      armorClass: 10,
      skillProficiencies: [],
      saveProficiencies: [],
      attacks: [],
      spells: [],
      spellSlots: {
        1: { max: 0, used: 0 },
        2: { max: 0, used: 0 },
        3: { max: 0, used: 0 },
        4: { max: 0, used: 0 },
        5: { max: 0, used: 0 },
        6: { max: 0, used: 0 },
        7: { max: 0, used: 0 },
        8: { max: 0, used: 0 },
        9: { max: 0, used: 0 }
      }
    },
    settings: { webhookUrl: "", firebaseUrl: "", syncRoom: "", diceColor: "#7c3aed" },
    sessionLock: {
      isLocked: false,
      baseline: null
    },
    ui: {
      activeTab: "dashboard",
      rollMode: "normal",
      status: {
        tone: "info",
        message: "Prêt pour l'aventure."
      },
      lastRoll: null,
      history: []
    }
  };
}
