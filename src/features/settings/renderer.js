import { appElement, state } from "../../app/store.js";
import { t } from "../../shared/i18n.js";

export function renderSessionSummary() {
  const container = appElement.querySelector("[data-session-summary]");

  if (!container) {
    return;
  }

  if (!state.sessionLock.isLocked) {
    container.innerHTML = `
      <p class="empty-state">
        ${t("session.notLocked")}
      </p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="session-lock-card">
      <p><strong>${t("settings.session.title")}.</strong> ${t("session.locked.desc")}</p>
      <ul class="session-lock-list">
        <li>${t("session.stat.level", { value: state.character.level })}</li>
        <li>${t("session.stat.hpMax", { value: state.character.hpMax })}</li>
        <li>${t("session.stat.ac", { value: state.character.armorClass })}</li>
        <li>${t("session.stat.skills", { value: state.character.skillProficiencies.length })}</li>
        <li>${t("session.stat.saves", { value: state.character.saveProficiencies.length })}</li>
      </ul>
    </div>
  `;
}
