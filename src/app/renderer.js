import { renderAttacks, renderLastAction } from "../features/combat/renderer.js";
import { renderAbilityDashboard, renderSkillDashboard, renderSaveDashboard } from "../features/rolls/renderer.js";
import { renderSpells, renderSpellSlots } from "../features/grimoire/renderer.js";
import { renderFormValues } from "../features/character/renderer.js";
import { renderSessionSummary } from "../features/settings/renderer.js";
import { renderParty } from "../features/party/renderer.js";
import { renderRoom } from "../features/room/renderer.js";

export function render(syncInputs = true) {
  renderAbilityDashboard();
  renderSkillDashboard();
  renderSaveDashboard();
  renderAttacks();
  renderSpells();
  renderSpellSlots();
  renderLastAction();
  renderSessionSummary();
  renderFormValues(syncInputs);
  renderParty();
  renderRoom();
}
