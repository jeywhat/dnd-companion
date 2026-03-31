/**
 * Audio feature – action handler.
 * Routes data-action clicks for the audio tab (YouTube + MP3).
 */

import { state, setStatus, commit } from "../../app/store.js";
import {
  audioPlayPause,
  audioLoadVideo,
  audioLoadMp3,
  audioSeek,
  audioSetVolume,
  audioTriggerSfx,
  audioStop,
} from "./renderer.js";
import { uploadToStorage, deriveStorageBucket } from "../../adapters/storage-upload.js";
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
    case "audio-upload-mp3": {
      if (!isGM()) { gmOnly(); return true; }
      const fileInput = document.getElementById("audio-mp3-file");
      if (!fileInput) return true;
      fileInput.click();
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

/**
 * Handle MP3 file selection from the hidden <input type="file">.
 * Called from events.js change handler.
 */
export async function handleMp3FileChange(fileInput) {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileInput.value = "";

  if (!file.type.startsWith("audio/")) {
    setStatus("error", t("audio.status.invalidFile"));
    commit(false);
    return;
  }

  const bucket = deriveStorageBucket(state.settings.firebaseUrl, state.settings.storageBucket);
  if (!bucket) {
    setStatus("error", t("audio.status.noBucket"));
    commit(false);
    return;
  }

  const roomId = state.settings.syncRoom;
  if (!roomId) return;

  const progressBar = document.getElementById("audio-upload-progress");
  const progressWrap = document.querySelector(".audio-upload-progress-wrap");
  if (progressWrap) progressWrap.hidden = false;

  try {
    const storagePath = `rooms/${roomId}/audio/${Date.now()}_${file.name}`;
    const downloadUrl = await uploadToStorage({
      bucket,
      path: storagePath,
      file,
      onProgress: (p) => {
        if (progressBar) progressBar.value = p * 100;
      },
    });

    audioLoadMp3(downloadUrl, file.name);
    setStatus("success", t("audio.status.mp3Loaded", { name: file.name }));
    commit(false);
  } catch (err) {
    console.error("[Audio] Upload failed:", err);
    setStatus("error", t("audio.status.uploadFailed"));
    commit(false);
  } finally {
    if (progressWrap) progressWrap.hidden = true;
    if (progressBar) progressBar.value = 0;
  }
}

function gmOnly() {
  setStatus("error", t("audio.status.gmOnly"));
  commit(false);
}
