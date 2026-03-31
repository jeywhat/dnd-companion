/**
 * Audio feature – YouTube + MP3 dual-source player with Firebase sync.
 * Lazy-loads YouTube IFrame API on first tab visit.
 * MP3 playback uses native HTML5 Audio element (streaming, no extra deps).
 * GM controls playback; all clients sync state via Firebase RTDB.
 */

import { state } from "../../app/store.js";
import {
  connectAudioSync,
  disconnectAudioSync,
  publishAudioState,
  publishSfx,
  PLAYER_ID,
} from "../../adapters/audio-sync.js";
import { t } from "../../shared/i18n.js";

let _ytPlayer = null;
let _audioEl = null;
let _apiReady = false;
let _apiLoading = false;
let _mounted = false;
let _currentVideoId = null;
let _currentTrackUrl = null;
let _activeSource = null; // "youtube" | "mp3" | null
let _suppressSync = false;
let _seekUpdateTimer = 0;
let _lastRemoteState = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isGM() {
  return state.room?.role === "gm";
}

function hasFirebase() {
  return !!(state.settings.firebaseUrl && state.settings.syncRoom);
}

function publish(patch) {
  if (!isGM() || !hasFirebase()) return;
  publishAudioState({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    patch,
  });
}

/**
 * Extract YouTube video ID from various URL formats or raw ID.
 */
export function extractVideoId(input) {
  if (!input) return null;
  const str = input.trim();
  if (/^[\w-]{11}$/.test(str)) return str;
  try {
    const url = new URL(str);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("/")[0];
    if (url.searchParams.has("v")) return url.searchParams.get("v");
    if (url.pathname.includes("/embed/")) return url.pathname.split("/embed/")[1]?.split(/[/?]/)[0];
  } catch { /* not a URL */ }
  return null;
}

// ─── YouTube IFrame API ──────────────────────────────────────────────────────

function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (_apiReady) { resolve(); return; }
    if (_apiLoading) {
      const check = setInterval(() => { if (_apiReady) { clearInterval(check); resolve(); } }, 100);
      return;
    }
    _apiLoading = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      _apiReady = true;
      _apiLoading = false;
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

function createYTPlayer() {
  const container = document.getElementById("yt-player-slot");
  if (!container || _ytPlayer) return;

  _ytPlayer = new window.YT.Player("yt-player-slot", {
    height: "200",
    width: "100%",
    playerVars: {
      playsinline: 1, controls: 0, modestbranding: 1,
      rel: 0, fs: 0, disablekb: 1, origin: window.location.origin,
    },
    events: {
      onReady: () => {
        console.info("[Audio] YouTube player ready");
        if (_lastRemoteState.sourceType !== "mp3" && _lastRemoteState.videoId) {
          applyRemoteState(_lastRemoteState);
        }
      },
      onStateChange: onYTStateChange,
    },
  });
}

function onYTStateChange(event) {
  if (_suppressSync || !isGM() || !hasFirebase() || _activeSource !== "youtube") return;
  const s = event.data;
  if (s === window.YT.PlayerState.PLAYING) {
    publish({ isPlaying: true, position: _ytPlayer.getCurrentTime(), videoId: _currentVideoId, sourceType: "youtube" });
    startSeekBroadcast();
  } else if (s === window.YT.PlayerState.PAUSED) {
    stopSeekBroadcast();
    publish({ isPlaying: false, position: _ytPlayer.getCurrentTime() });
  } else if (s === window.YT.PlayerState.ENDED) {
    stopSeekBroadcast();
    publish({ isPlaying: false, position: 0 });
  }
}

// ─── HTML5 Audio element (MP3) ───────────────────────────────────────────────

function ensureAudioEl() {
  if (_audioEl) return _audioEl;
  _audioEl = new Audio();
  _audioEl.preload = "auto";
  _audioEl.crossOrigin = "anonymous";

  _audioEl.addEventListener("play", () => {
    if (_suppressSync || !isGM() || _activeSource !== "mp3") return;
    publish({ isPlaying: true, position: _audioEl.currentTime, sourceType: "mp3" });
    startSeekBroadcast();
  });
  _audioEl.addEventListener("pause", () => {
    if (_suppressSync || !isGM() || _activeSource !== "mp3") return;
    stopSeekBroadcast();
    publish({ isPlaying: false, position: _audioEl.currentTime });
  });
  _audioEl.addEventListener("ended", () => {
    if (_suppressSync || !isGM() || _activeSource !== "mp3") return;
    stopSeekBroadcast();
    publish({ isPlaying: false, position: 0 });
  });
  _audioEl.addEventListener("timeupdate", () => {
    if (_activeSource !== "mp3") return;
    updateSeekbarFromTime(_audioEl.currentTime, _audioEl.duration);
  });

  return _audioEl;
}

// ─── Shared seek broadcast ───────────────────────────────────────────────────

function startSeekBroadcast() {
  stopSeekBroadcast();
  _seekUpdateTimer = setInterval(() => {
    if (!isGM() || !hasFirebase()) return;
    const pos = getActivePosition();
    if (typeof pos === "number") publish({ position: pos });
  }, 5000);
}

function stopSeekBroadcast() {
  clearInterval(_seekUpdateTimer);
  _seekUpdateTimer = 0;
}

function getActivePosition() {
  if (_activeSource === "youtube") {
    try { return _ytPlayer?.getCurrentTime?.(); } catch { return null; }
  }
  if (_activeSource === "mp3") {
    return _audioEl?.currentTime ?? null;
  }
  return null;
}

function getActiveDuration() {
  if (_activeSource === "youtube") {
    try { return _ytPlayer?.getDuration?.() || 0; } catch { return 0; }
  }
  if (_activeSource === "mp3") {
    const d = _audioEl?.duration;
    return (d && isFinite(d)) ? d : 0;
  }
  return 0;
}

// ─── Remote state ────────────────────────────────────────────────────────────

function handleRemoteUpdate(type, data) {
  if (!data) return;

  if (type === "snapshot") {
    _lastRemoteState = data || {};
  } else {
    Object.assign(_lastRemoteState, data);
  }

  // SFX trigger
  if (data.sfx && data.sfx.triggeredBy !== PLAYER_ID) {
    playSfxLocally(data.sfx);
  }

  // GM is source of truth — only apply initial load
  if (isGM()) {
    if (!_activeSource && (_lastRemoteState.videoId || _lastRemoteState.trackUrl)) {
      applyRemoteState(_lastRemoteState);
    }
    return;
  }

  applyRemoteState(_lastRemoteState);
}

function applyRemoteState(rs) {
  _suppressSync = true;
  try {
    if (rs.sourceType === "mp3" && rs.trackUrl) {
      applyMp3State(rs);
    } else if (rs.videoId) {
      applyYouTubeState(rs);
    }
    if (typeof rs.volume === "number") {
      setVolumeInternal(rs.volume);
    }
  } finally {
    setTimeout(() => { _suppressSync = false; }, 500);
  }
  updatePlayerUI(rs);
}

function applyYouTubeState(rs) {
  if (!_ytPlayer || typeof _ytPlayer.loadVideoById !== "function") return;

  // Stop MP3 if playing
  if (_activeSource === "mp3" && _audioEl) {
    _audioEl.pause();
    _audioEl.src = "";
  }
  _activeSource = "youtube";
  _currentTrackUrl = null;
  showSource("youtube");

  if (rs.videoId !== _currentVideoId) {
    _currentVideoId = rs.videoId;
    if (rs.isPlaying) {
      _ytPlayer.loadVideoById(rs.videoId, rs.position || 0);
    } else {
      _ytPlayer.cueVideoById(rs.videoId, rs.position || 0);
    }
  } else {
    syncPositionYT(rs);
    if (rs.isPlaying === true) { try { _ytPlayer.playVideo(); } catch {} }
    else if (rs.isPlaying === false) { try { _ytPlayer.pauseVideo(); } catch {} }
  }
}

function syncPositionYT(rs) {
  if (typeof rs.position !== "number") return;
  try {
    const local = _ytPlayer.getCurrentTime();
    if (Math.abs(local - rs.position) > 3) _ytPlayer.seekTo(rs.position, true);
  } catch {}
}

function applyMp3State(rs) {
  const audio = ensureAudioEl();

  // Stop YouTube if playing
  if (_activeSource === "youtube" && _ytPlayer) {
    try { _ytPlayer.pauseVideo(); } catch {}
  }
  _activeSource = "mp3";
  _currentVideoId = null;
  showSource("mp3");

  if (rs.trackUrl !== _currentTrackUrl) {
    _currentTrackUrl = rs.trackUrl;
    audio.src = rs.trackUrl;
    audio.load();
    audio.addEventListener("canplay", function onCanPlay() {
      audio.removeEventListener("canplay", onCanPlay);
      if (rs.position) audio.currentTime = rs.position;
      if (rs.isPlaying) audio.play().catch(() => {});
    });
  } else {
    if (typeof rs.position === "number") {
      const drift = Math.abs(audio.currentTime - rs.position);
      if (drift > 2) audio.currentTime = rs.position;
    }
    if (rs.isPlaying === true && audio.paused) audio.play().catch(() => {});
    else if (rs.isPlaying === false && !audio.paused) audio.pause();
  }
}

function setVolumeInternal(vol) {
  if (_ytPlayer?.setVolume) _ytPlayer.setVolume(vol * 100);
  if (_audioEl) _audioEl.volume = vol;
}

function playSfxLocally(sfx) {
  const url = sfx?.url || sfx?.videoId;
  if (!url) return;
  // Only play if it looks like a direct audio URL (not a YouTube video ID)
  if (url.startsWith("http")) {
    try {
      const sfxAudio = new Audio(url);
      sfxAudio.volume = 0.9;
      sfxAudio.play().catch(() => {});
    } catch {}
  } else {
    console.info("[Audio] SFX triggered (YouTube):", sfx?.label || url);
  }
}

// ─── UI ──────────────────────────────────────────────────────────────────────

function showSource(source) {
  const ytWrap = document.querySelector(".audio-yt-wrap");
  const mp3Wrap = document.querySelector(".audio-mp3-wrap");
  if (ytWrap) ytWrap.hidden = source === "mp3";
  if (mp3Wrap) mp3Wrap.hidden = source !== "mp3";
}

function updateSeekbarFromTime(currentTime, duration) {
  const seekbar = document.getElementById("audio-seekbar");
  if (seekbar && duration > 0 && !seekbar.matches(":active")) {
    seekbar.value = String((currentTime / duration) * 100);
  }
  const timeDisplay = document.querySelector("[data-audio-time]");
  if (timeDisplay && duration > 0) {
    timeDisplay.textContent = `${fmtTime(currentTime)} / ${fmtTime(duration)}`;
  }
}

function updatePlayerUI(rs) {
  const playBtn = document.querySelector("[data-action='audio-playpause']");
  if (playBtn) playBtn.textContent = rs?.isPlaying ? "⏸️" : "▶️";

  const seekbar = document.getElementById("audio-seekbar");
  if (seekbar && typeof rs?.position === "number" && !seekbar.matches(":active")) {
    const dur = getActiveDuration();
    if (dur > 0) seekbar.value = String((rs.position / dur) * 100);
  }

  const volSlider = document.getElementById("audio-volume");
  if (volSlider && typeof rs?.volume === "number" && !volSlider.matches(":active")) {
    volSlider.value = String(rs.volume * 100);
  }

  const nowPlaying = document.querySelector("[data-audio-now-playing]");
  if (nowPlaying) {
    if (rs?.sourceType === "mp3" && rs.trackName) {
      nowPlaying.textContent = `🎵 ${rs.trackName}`;
    } else if (_currentVideoId) {
      nowPlaying.textContent = `📺 YouTube: ${_currentVideoId}`;
    } else {
      nowPlaying.textContent = t("audio.nothingPlaying");
    }
  }

  const timeDisplay = document.querySelector("[data-audio-time]");
  if (timeDisplay) {
    const dur = getActiveDuration();
    const pos = rs?.position ?? 0;
    timeDisplay.textContent = dur > 0 ? `${fmtTime(pos)} / ${fmtTime(dur)}` : "";
  }
}

function fmtTime(s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Mount ───────────────────────────────────────────────────────────────────

async function mount() {
  if (_mounted) return;
  _mounted = true;

  ensureAudioEl();
  await loadYouTubeAPI();
  if (!document.getElementById("yt-player-slot")) { _mounted = false; return; }
  createYTPlayer();

  if (hasFirebase()) {
    connectAudioSync({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      onRemoteUpdate: handleRemoteUpdate,
    });
  }
  console.info("[Audio] Monté (YouTube + MP3)");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderAudio() {
  if (state.ui.activeTab === "audio" && !_mounted) {
    mount();
  }
  const gmControls = document.querySelectorAll(".audio-gm-only");
  for (const el of gmControls) el.hidden = !isGM();

  // Show player hint for non-GM
  const hint = document.querySelector("[data-audio-player-hint]");
  if (hint) hint.hidden = isGM();
}

export function reconnectAudioSync() {
  if (!hasFirebase() || !_mounted) return;
  disconnectAudioSync();
  connectAudioSync({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    onRemoteUpdate: handleRemoteUpdate,
  });
}

// ─── Player Controls (called by handler) ─────────────────────────────────────

export function audioPlayPause() {
  if (!isGM()) return;
  if (_activeSource === "mp3" && _audioEl) {
    if (_audioEl.paused) _audioEl.play().catch(() => {});
    else _audioEl.pause();
  } else if (_activeSource === "youtube" && _ytPlayer) {
    try {
      const s = _ytPlayer.getPlayerState();
      if (s === window.YT.PlayerState.PLAYING) _ytPlayer.pauseVideo();
      else _ytPlayer.playVideo();
    } catch {}
  } else if (_ytPlayer) {
    // No active source — try to resume YouTube
    try { _ytPlayer.playVideo(); } catch {}
  }
}

export function audioLoadVideo(input) {
  const videoId = extractVideoId(input);
  if (!videoId) return false;
  if (!_ytPlayer) return false;

  // Switch to YouTube
  if (_activeSource === "mp3" && _audioEl) {
    _audioEl.pause();
    _audioEl.src = "";
  }
  _activeSource = "youtube";
  _currentVideoId = videoId;
  _currentTrackUrl = null;
  showSource("youtube");
  _ytPlayer.loadVideoById(videoId, 0);

  publish({ videoId, position: 0, isPlaying: true, sourceType: "youtube", trackUrl: "", trackName: "" });
  return true;
}

export function audioLoadMp3(url, name) {
  if (!url) return false;
  const audio = ensureAudioEl();

  // Switch to MP3
  if (_activeSource === "youtube" && _ytPlayer) {
    try { _ytPlayer.pauseVideo(); } catch {}
  }
  _activeSource = "mp3";
  _currentVideoId = null;
  _currentTrackUrl = url;
  showSource("mp3");

  audio.src = url;
  audio.load();
  audio.addEventListener("canplay", function onCanPlay() {
    audio.removeEventListener("canplay", onCanPlay);
    audio.play().catch(() => {});
  });

  publish({ trackUrl: url, trackName: name || "MP3", position: 0, isPlaying: true, sourceType: "mp3", videoId: "" });
  return true;
}

export function audioSeek(fraction) {
  if (!isGM()) return;
  const duration = getActiveDuration();
  if (duration <= 0) return;
  const pos = fraction * duration;

  if (_activeSource === "mp3" && _audioEl) {
    _audioEl.currentTime = pos;
  } else if (_activeSource === "youtube" && _ytPlayer) {
    _ytPlayer.seekTo(pos, true);
  }
  publish({ position: pos });
}

export function audioSetVolume(value) {
  const vol = Math.max(0, Math.min(1, value));
  setVolumeInternal(vol);
  publish({ volume: vol });
}

export function audioTriggerSfx(sfxUrl, label) {
  if (!isGM() || !hasFirebase()) return;
  // Play locally
  try {
    const sfxAudio = new Audio(sfxUrl);
    sfxAudio.volume = 0.9;
    sfxAudio.play().catch(() => {});
  } catch {}
  // Broadcast
  publishSfx({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    videoId: sfxUrl,
    label,
  });
}

export function audioStop() {
  if (!isGM()) return;
  stopSeekBroadcast();
  if (_activeSource === "mp3" && _audioEl) {
    _audioEl.pause();
    _audioEl.currentTime = 0;
  }
  if (_activeSource === "youtube" && _ytPlayer) {
    try { _ytPlayer.stopVideo(); } catch {}
  }
  _activeSource = null;
  _currentVideoId = null;
  _currentTrackUrl = null;
  publish({ isPlaying: false, position: 0, videoId: "", trackUrl: "", trackName: "", sourceType: "" });
}

export function destroyAudio() {
  disconnectAudioSync();
  stopSeekBroadcast();
  if (_ytPlayer?.destroy) _ytPlayer.destroy();
  if (_audioEl) { _audioEl.pause(); _audioEl.src = ""; }
  _ytPlayer = null;
  _audioEl = null;
  _mounted = false;
  _activeSource = null;
  _currentVideoId = null;
  _currentTrackUrl = null;
  _lastRemoteState = {};
}
