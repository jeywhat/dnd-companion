import { ABILITIES, SKILLS } from "../data/constants.js";
import { t } from "../shared/i18n.js";

const abilityMap = new Map(ABILITIES.map((ability) => [ability.key, ability]));
const skillMap = new Map(SKILLS.map((skill) => [skill.key, skill]));

export function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatSignedNumber(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function calculateModifier(score) {
  return Math.floor((toInt(score, 10) - 10) / 2);
}

export function calculateProficiencyBonus(level) {
  return 2 + Math.floor((clamp(toInt(level, 1), 1, 20) - 1) / 4);
}

export function getAbilityLabel(abilityKey) {
  return t(`ability.${abilityKey}`) || abilityMap.get(abilityKey)?.label || abilityKey;
}

export function getAbilityShort(abilityKey) {
  return t(`ability.${abilityKey}.short`) || abilityMap.get(abilityKey)?.short || abilityKey.toUpperCase().slice(0, 3);
}

export function getSkillLabel(skillKey) {
  return t(`skill.${skillKey}`) || skillMap.get(skillKey)?.label || skillKey;
}

export function getSkillDefinition(skillKey) {
  return skillMap.get(skillKey);
}

export function getAbilityModifier(character, abilityKey) {
  return calculateModifier(character.abilities[abilityKey] ?? 10);
}

export function getSkillBonus(character, skillKey) {
  const skill = getSkillDefinition(skillKey);

  if (!skill) {
    return 0;
  }

  const abilityModifier = getAbilityModifier(character, skill.ability);
  const proficiencyBonus = calculateProficiencyBonus(character.level);
  const isProficient = character.skillProficiencies.includes(skillKey);

  return abilityModifier + (isProficient ? proficiencyBonus : 0);
}

export function getSaveBonus(character, abilityKey) {
  const abilityModifier = getAbilityModifier(character, abilityKey);
  const proficiencyBonus = calculateProficiencyBonus(character.level);
  const isProficient = character.saveProficiencies.includes(abilityKey);

  return abilityModifier + (isProficient ? proficiencyBonus : 0);
}

export function getAttackBonus(character, attack) {
  const abilityModifier = getAbilityModifier(character, attack.ability);
  const proficiencyBonus = calculateProficiencyBonus(character.level);

  return (
    abilityModifier +
    (attack.proficient ? proficiencyBonus : 0) +
    toInt(attack.bonus, 0)
  );
}

export function normaliseSelection(values) {
  return [...new Set(values)].sort();
}

export function createWatchedSnapshot(character) {
  return {
    level: clamp(toInt(character.level, 1), 1, 20),
    abilities: ABILITIES.reduce((accumulator, ability) => {
      accumulator[ability.key] = toInt(character.abilities[ability.key], 10);
      return accumulator;
    }, {}),
    hpMax: toInt(character.hpMax, 10),
    armorClass: toInt(character.armorClass, 10),
    skillProficiencies: normaliseSelection(character.skillProficiencies),
    saveProficiencies: normaliseSelection(character.saveProficiencies)
  };
}

export function detectLockedChanges(baseline, character) {
  if (!baseline) {
    return [];
  }

  const current = createWatchedSnapshot(character);
  const changes = [];

  if (baseline.level !== current.level) {
    changes.push({
      label: t("character.level.label"),
      from: baseline.level,
      to: current.level
    });
  }

  for (const ability of ABILITIES) {
    const previousValue = baseline.abilities[ability.key];
    const nextValue = current.abilities[ability.key];

    if (previousValue !== nextValue) {
      changes.push({
        label: getAbilityLabel(ability.key),
        from: previousValue,
        to: nextValue
      });
    }
  }

  if (baseline.hpMax !== current.hpMax) {
    changes.push({
      label: t("character.hpMax.label"),
      from: baseline.hpMax,
      to: current.hpMax
    });
  }

  if (baseline.armorClass !== current.armorClass) {
    changes.push({
      label: t("character.ac.label"),
      from: baseline.armorClass,
      to: current.armorClass
    });
  }

  for (const skill of SKILLS) {
    const hadSkill = baseline.skillProficiencies.includes(skill.key);
    const hasSkill = current.skillProficiencies.includes(skill.key);

    if (hadSkill !== hasSkill) {
      changes.push({
        label: getSkillLabel(skill.key),
        from: hadSkill,
        to: hasSkill
      });
    }
  }

  for (const ability of ABILITIES) {
    const hadSave = baseline.saveProficiencies.includes(ability.key);
    const hasSave = current.saveProficiencies.includes(ability.key);

    if (hadSave !== hasSave) {
      changes.push({
        label: `${t("rolls.saves.title")} ${getAbilityShort(ability.key)}`,
        from: hadSave,
        to: hasSave
      });
    }
  }

  return changes;
}

export function restoreLockedCharacter(character, baseline) {
  if (!baseline) {
    return character;
  }

  const restoredCharacter = {
    ...character,
    level: baseline.level,
    abilities: {
      ...baseline.abilities
    },
    hpMax: baseline.hpMax,
    armorClass: baseline.armorClass,
    skillProficiencies: [...baseline.skillProficiencies],
    saveProficiencies: [...baseline.saveProficiencies]
  };

  restoredCharacter.currentHp = clamp(
    toInt(character.currentHp, baseline.hpMax),
    0,
    restoredCharacter.hpMax
  );

  return restoredCharacter;
}
