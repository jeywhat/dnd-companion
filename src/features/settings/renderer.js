import { appElement, state } from "../../app/store.js";

export function renderSessionSummary() {
  const container = appElement.querySelector("[data-session-summary]");

  if (!container) {
    return;
  }

  if (!state.sessionLock.isLocked) {
    container.innerHTML = `
      <p class="empty-state">
        La session n'est pas encore verrouillée. Activez-la au début de la partie pour
        figer le niveau, les caractéristiques, les PV max, la CA et les maîtrises.
      </p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="session-lock-card">
      <p><strong>Session verrouillée.</strong> Toute modification suspecte est restaurée puis signalée sur Discord.</p>
      <ul class="session-lock-list">
        <li>Niveau surveillé : ${state.character.level}</li>
        <li>PV max surveillés : ${state.character.hpMax}</li>
        <li>CA surveillée : ${state.character.armorClass}</li>
        <li>Compétences maîtrisées : ${state.character.skillProficiencies.length}</li>
        <li>Sauvegardes maîtrisées : ${state.character.saveProficiencies.length}</li>
      </ul>
    </div>
  `;
}
