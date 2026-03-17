import { createWatchedSnapshot, detectLockedChanges } from "../core/character.js";
import { loadState } from "./storage.js";

export function createSessionBaseline(character) {
  return createWatchedSnapshot(character);
}

export function createIntegrityMonitor({ getState, onViolation, onStorageTamper }) {
  let lastFingerprint = "";
  let lastAlertAt = 0;

  const emitIfNeeded = (changes, source, handler) => {
    if (!changes.length) {
      return;
    }

    const fingerprint = JSON.stringify(changes);
    const now = Date.now();

    if (fingerprint === lastFingerprint && now - lastAlertAt < 5000) {
      return;
    }

    lastFingerprint = fingerprint;
    lastAlertAt = now;
    handler(changes, source);
  };

  const inspect = () => {
    const currentState = getState();

    if (!currentState.sessionLock.isLocked || !currentState.sessionLock.baseline) {
      return;
    }

    const runtimeChanges = detectLockedChanges(
      currentState.sessionLock.baseline,
      currentState.character
    );

    emitIfNeeded(runtimeChanges, "runtime", onViolation);

    const storedState = loadState();
    const storageChanges = detectLockedChanges(
      currentState.sessionLock.baseline,
      storedState.character
    );

    emitIfNeeded(storageChanges, "storage", onStorageTamper);
  };

  const intervalId = window.setInterval(inspect, 3000);
  const handleStorage = () => inspect();

  window.addEventListener("storage", handleStorage);

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("storage", handleStorage);
  };
}
