/**
 * Carte (Map) feature – action handler.
 * Handles toolbar actions: add token, upload map, clear canvas.
 */

import { state, setStatus, commit } from "../../app/store.js";
import { addPlayerToken, addMapImage, getExcalidrawAPI } from "./renderer.js";
import { PLAYER_ID } from "../../adapters/carte-sync.js";
import { t } from "../../shared/i18n.js";

function isGM() {
  return state.room?.role === "gm";
}

function handleAddToken(button) {
  const name = state.character.name || t("app.defaultCharName");
  const color = state.settings.diceColor || "#7c3aed";

  const tokenId = addPlayerToken({ name, color });
  if (tokenId) {
    setStatus("success", t("carte.status.tokenAdded", { name }));
    commit(false);
  }
  return true;
}

function handleUploadMap() {
  if (!isGM()) {
    setStatus("error", t("carte.status.gmOnly"));
    commit(false);
    return true;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        addMapImage({
          dataUrl: reader.result,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setStatus("success", t("carte.status.mapUploaded", { name: file.name }));
        commit(false);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
  return true;
}

function handleClearCanvas() {
  if (!isGM()) {
    setStatus("error", t("carte.status.gmOnly"));
    commit(false);
    return true;
  }

  const api = getExcalidrawAPI();
  if (api) {
    api.resetScene();
    setStatus("info", t("carte.status.cleared"));
    commit(false);
  }
  return true;
}

export async function handleCarteAction(button) {
  const action = button.dataset.action;

  switch (action) {
    case "carte-add-token":
      return handleAddToken(button);
    case "carte-upload-map":
      return handleUploadMap();
    case "carte-clear":
      return handleClearCanvas();
    default:
      return false;
  }
}
