import { initStore, injectRender, getCleanupHandlers } from "./app/store.js";
import { render } from "./app/renderer.js";
import { getAppTemplate } from "./app/shell.js";
import { bindEvents } from "./app/events.js";
import { applyWebhookFromUrl, reconnectSync } from "./features/settings/handler.js";
import { reconnectRoom } from "./features/room/handler.js";
import { preloadDiceBox } from "./adapters/dice-animation.js";

const appElement = document.querySelector("#app");

if (!appElement) {
  throw new Error("Le conteneur principal de l'application est introuvable.");
}

initStore(appElement);
injectRender(render);

appElement.innerHTML = getAppTemplate();
applyWebhookFromUrl();
bindEvents(appElement);
render(true);
reconnectSync();
reconnectRoom();
preloadDiceBox();

const { flush } = getCleanupHandlers();
window.addEventListener("beforeunload", flush);
