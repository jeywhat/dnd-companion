/**
 * Audio feature – action handler.
 * Routes data-action clicks for the audio tab.
 */

import { state, setStatus, commit } from "../../app/store.js";
import {
  audioPlayPause,
  audioLoadVideo,
  audioSeek,
  audioSetVolume,
  audioTriggerSfx,
  audioStop,
} from "./renderer.js";
import { t } from "../../shared/i18n.js";

function isGM() {
  return state.room?.role === "gm";
}

export async function handleAudioAction(button) {
  const action = button.dataset.action;

  switch (action) {
    case "audio-playpause": {
      if (!isGM()) { gmOnly(); return true; }
      audioPlayPause();
      return true;
    }
    case "audio-stop": {
      if (!isGM()) { gmOnly(); return true; }
      audioStop();
      setStatus("info", t("audio.status.stopped"));
      commit(false);
      return true;
    }
    case "audio-load": {
      if (!isGM()) { gmOnly(); return true; }
      const input = document.getElementById("audio-url-input");
      const url = input?.value?.trim();
      if (!url) return true;
      const ok = audioLoadVideo(url);
      if (ok) {
        input.value = "";
        setStatus("success", t("audio.status.loaded"));
        commit(false);
      } else {
        setStatus("error", t("audio.status.invalidUrl"));
        commit(false);
      }
      return true;
    }
    case "audio-sfx": {
      if (!isGM()) { gmOnly(); return true; }
      const videoId = button.dataset.sfxId;
      const label = button.dataset.sfxLabel || "SFX";
      if (videoId) {
        audioTriggerSfx(videoId, label);
        setStatus("info", t("audio.status.sfxTriggered", { name: label }));
        commit(false);
      }
      return true;
    }
    case "audio-preset": {
      if (!isGM()) { gmOnly(); return true; }
      const videoId = button.dataset.presetId;
      if (videoId) {
        audioLoadVideo(videoId);
        setStatus("success", t("audio.status.loaded"));
        commit(false);
      }
      return true;
    }
    default:
      return false;
  }
}

export function handleAudioInput(target) {
  if (target.id === "audio-seekbar") {
    audioSeek(Number(target.value) / 100);
    return true;
  }
  if (target.id === "audio-volume") {
    audioSetVolume(Number(target.value) / 100);
    return true;
  }
  return false;
}

function gmOnly() {
  setStatus("error", t("audio.status.gmOnly"));
  commit(false);
}
