import { setStatus, commit, state, appElement } from "./store.js";
import { render } from "./renderer.js";
import { getAppTemplate } from "./shell.js";
import { setLocale } from "../shared/i18n.js";
import { handleCombatTrackerAction } from "../features/combat-tracker/handler.js";
import { handleCombatAction } from "../features/combat/handler.js";
import { handleRollsAction, handleRollsChange } from "../features/rolls/handler.js";
import { handleGrimoireAction, handleGrimoireSubmit } from "../features/grimoire/handler.js";
import { handleCharacterInput, handleCharacterChange, handleCharacterSubmit, handleCharacterAction } from "../features/character/handler.js";
import { handleSettingsAction, handleSettingsInput } from "../features/settings/handler.js";
import { handleRoomAction } from "../features/room/handler.js";

function switchTab(tab) {
  if (tab === state.ui.activeTab) return;

  state.ui.activeTab = tab;
  commit(false);

  const panel = appElement.querySelector(`[data-panel="${tab}"]`);
  if (panel) {
    panel.classList.add("panel-enter");
    panel.addEventListener("animationend", () => panel.classList.remove("panel-enter"), { once: true });
  }
}

const ACTION_HANDLERS = [
  handleCombatTrackerAction,
  handleCombatAction,
  handleRollsAction,
  handleGrimoireAction,
  handleCharacterAction,
  handleRoomAction,
  handleSettingsAction,
];

async function handleAction(actionButton) {
  if (actionButton.dataset.action === "switch-tab") {
    switchTab(actionButton.dataset.tab);
    return;
  }

  for (const handler of ACTION_HANDLERS) {
    const handled = await handler(actionButton);
    if (handled) return;
  }
}

function handleInput(event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
    return;
  }

  handleCharacterInput(target) || handleSettingsInput(target);
}

function handleChange(event) {
  const target = event.target;

  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
    return;
  }

  handleCharacterChange(target) || handleRollsChange(target);
}

function handleSubmit(event) {
  const form = event.target;

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  if (handleCharacterSubmit(form) || handleGrimoireSubmit(form)) {
    event.preventDefault();
  }
}

export function bindEvents(appElement) {
  appElement.addEventListener("click", (event) => {
    const localeBtn = event.target.closest("[data-locale]");
    if (localeBtn) {
      setLocale(localeBtn.dataset.locale);
      appElement.innerHTML = getAppTemplate();
      render(true);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    void handleAction(actionButton).catch((error) => {
      setStatus("error", error.message);
      commit(false);
    });
  });

  appElement.addEventListener("input", handleInput);
  appElement.addEventListener("change", handleChange);
  appElement.addEventListener("submit", handleSubmit);
}
