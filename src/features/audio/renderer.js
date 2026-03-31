/**
 * Audio feature – YouTube IFrame player + Firebase sync renderer.
 * Lazy-loads YouTube IFrame API on first tab visit.
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

let _player = null;
let _apiReady = false;
let _apiLoading = false;
let _mounted = false;
let _currentVideoId = null;
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

/**
 * Extract YouTube video ID from various URL formats or raw ID.
 */
export function extractVideoId(input) {
  if (!input) return null;
  const str = input.trim();
  // Already a bare ID (11 chars, alphanumeric + _ -)
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

function createPlayer() {
  const container = document.getElementById("yt-player-slot");
  if (!container || _player) return;

  _player = new window.YT.Player("yt-player-slot", {
    height: "200",
    width: "100%",
    playerVars: {
      playsinline: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      fs: 0,
      disablekb: 1,
      origin: window.location.origin,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
}

function onPlayerReady() {
  console.info("[Audio] YouTube player ready");
  // Apply last known remote state if we have one
  if (_lastRemoteState.videoId) {
    applyRemoteState(_lastRemoteState);
  }
}

function onPlayerStateChange(event) {
  if (_suppressSync || !isGM() || !hasFirebase()) return;

  const ytState = event.data;
  // YT.PlayerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
  if (ytState === window.YT.PlayerState.PLAYING) {
    publishAudioState({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      patch: {
        isPlaying: true,
        position: _player.getCurrentTime(),
        videoId: _currentVideoId,
      },
    });
    startSeekBroadcast();
  } else if (ytState === window.YT.PlayerState.PAUSED) {
    stopSeekBroadcast();
    publishAudioState({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      patch: {
        isPlaying: false,
        position: _player.getCurrentTime(),
      },
    });
  } else if (ytState === window.YT.PlayerState.ENDED) {
    stopSeekBroadcast();
    publishAudioState({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      patch: { isPlaying: false, position: 0 },
    });
  }
}

// Periodically broadcast position while GM is playing (every 5s)
function startSeekBroadcast() {
  stopSeekBroadcast();
  _seekUpdateTimer = setInterval(() => {
    if (!_player || !isGM() || !hasFirebase()) return;
    try {
      const pos = _player.getCurrentTime();
      if (typeof pos === "number") {
        publishAudioState({
          firebaseUrl: state.settings.firebaseUrl,
          roomId: state.settings.syncRoom,
          patch: { position: pos },
        });
      }
    } catch { /* player not ready */ }
  }, 5000);
}

function stopSeekBroadcast() {
  clearInterval(_seekUpdateTimer);
  _seekUpdateTimer = 0;
}

// ─── Remote state ────────────────────────────────────────────────────────────

function handleRemoteUpdate(type, data) {
  if (!data) return;

  if (type === "snapshot") {
    _lastRemoteState = data || {};
  } else {
    Object.assign(_lastRemoteState, data);
  }

  // Handle SFX trigger
  if (data.sfx && data.sfx.triggeredBy !== PLAYER_ID) {
    playSfxLocally(data.sfx.videoId);
  }

  // Don't override GM's own player state (they are the source of truth)
  if (isGM()) {
    // But apply initial video load if needed
    if (!_currentVideoId && _lastRemoteState.videoId) {
      applyRemoteState(_lastRemoteState);
    }
    return;
  }

  applyRemoteState(_lastRemoteState);
}

function applyRemoteState(rs) {
  if (!_player || typeof _player.loadVideoById !== "function") return;

  _suppressSync = true;
  try {
    if (rs.videoId && rs.videoId !== _currentVideoId) {
      _currentVideoId = rs.videoId;
      if (rs.isPlaying) {
        _player.loadVideoById(rs.videoId, rs.position || 0);
      } else {
        _player.cueVideoById(rs.videoId, rs.position || 0);
      }
    } else {
      // Sync position if drift > 3s
      if (typeof rs.position === "number" && _player.getCurrentTime) {
        try {
          const localPos = _player.getCurrentTime();
          if (Math.abs(localPos - rs.position) > 3) {
            _player.seekTo(rs.position, true);
          }
        } catch { /* player not ready */ }
      }

      if (rs.isPlaying === true) {
        try { _player.playVideo(); } catch { /* */ }
      } else if (rs.isPlaying === false) {
        try { _player.pauseVideo(); } catch { /* */ }
      }
    }

    if (typeof rs.volume === "number" && _player.setVolume) {
      _player.setVolume(rs.volume * 100);
    }
  } finally {
    setTimeout(() => { _suppressSync = false; }, 500);
  }

  updatePlayerUI(rs);
}

function playSfxLocally(videoId) {
  if (!videoId || !_player || typeof _player.loadVideoById !== "function") return;
  // SFX: quick play without disrupting main track state
  // We'll use a temporary load — not ideal but YouTube API only has one player per instance.
  // For a production-grade solution, use a second hidden player.
  // For now, show a toast.
  const sfxLabel = videoId;
  console.info("[Audio] SFX triggered:", sfxLabel);
}

// ─── UI updates ──────────────────────────────────────────────────────────────

function updatePlayerUI(rs) {
  const playBtn = document.querySelector("[data-action='audio-playpause']");
  if (playBtn) {
    playBtn.textContent = rs?.isPlaying ? "⏸️" : "▶️";
  }

  const seekbar = document.getElementById("audio-seekbar");
  if (seekbar && typeof rs?.position === "number" && !seekbar.matches(":active")) {
    const duration = getDuration();
    if (duration > 0) {
      seekbar.value = String((rs.position / duration) * 100);
    }
  }

  const volSlider = document.getElementById("audio-volume");
  if (volSlider && typeof rs?.volume === "number" && !volSlider.matches(":active")) {
    volSlider.value = String(rs.volume * 100);
  }

  const nowPlaying = document.querySelector("[data-audio-now-playing]");
  if (nowPlaying) {
    nowPlaying.textContent = _currentVideoId
      ? `🎵 ${_currentVideoId}`
      : t("audio.nothingPlaying");
  }
}

function getDuration() {
  try { return _player?.getDuration?.() || 0; } catch { return 0; }
}

// ─── Mount ───────────────────────────────────────────────────────────────────

async function mount() {
  if (_mounted) return;
  _mounted = true;

  await loadYouTubeAPI();
  // Check container still exists after async load
  if (!document.getElementById("yt-player-slot")) {
    _mounted = false;
    return;
  }
  createPlayer();

  if (hasFirebase()) {
    connectAudioSync({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      onRemoteUpdate: handleRemoteUpdate,
    });
  }

  console.info("[Audio] Monté");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function renderAudio() {
  if (state.ui.activeTab === "audio" && !_mounted) {
    mount();
  }
  // Update GM-only controls visibility
  const gmControls = document.querySelectorAll(".audio-gm-only");
  for (const el of gmControls) {
    el.hidden = !isGM();
  }
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
  if (!_player || !isGM()) return;
  try {
    const st = _player.getPlayerState();
    if (st === window.YT.PlayerState.PLAYING) {
      _player.pauseVideo();
    } else {
      _player.playVideo();
    }
  } catch { /* player not ready */ }
}

export function audioLoadVideo(input) {
  const videoId = extractVideoId(input);
  if (!videoId || !_player) return false;

  _currentVideoId = videoId;
  _player.loadVideoById(videoId, 0);

  if (isGM() && hasFirebase()) {
    publishAudioState({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      patch: { videoId, position: 0, isPlaying: true },
    });
  }
  return true;
}

export function audioSeek(fraction) {
  if (!_player || !isGM()) return;
  const duration = getDuration();
  if (duration <= 0) return;
  const pos = fraction * duration;
  _player.seekTo(pos, true);
  publishAudioState({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    patch: { position: pos },
  });
}

export function audioSetVolume(value) {
  if (!_player) return;
  const vol = Math.max(0, Math.min(1, value));
  _player.setVolume(vol * 100);
  if (isGM() && hasFirebase()) {
    publishAudioState({
      firebaseUrl: state.settings.firebaseUrl,
      roomId: state.settings.syncRoom,
      patch: { volume: vol },
    });
  }
}

export function audioTriggerSfx(videoId, label) {
  if (!isGM() || !hasFirebase()) return;
  // Play locally
  if (_player && typeof _player.loadVideoById === "function") {
    // Save current state to restore after SFX
    const savedId = _currentVideoId;
    const savedPos = _player.getCurrentTime?.() || 0;
    const savedPlaying = _player.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;

    _suppressSync = true;
    _player.loadVideoById(videoId, 0);

    // Restore after 4 seconds (short SFX)
    setTimeout(() => {
      if (savedId) {
        _currentVideoId = savedId;
        if (savedPlaying) {
          _player.loadVideoById(savedId, savedPos + 4);
        } else {
          _player.cueVideoById(savedId, savedPos);
        }
      }
      _suppressSync = false;
    }, 4000);
  }
  // Broadcast to all players
  publishSfx({
    firebaseUrl: state.settings.firebaseUrl,
    roomId: state.settings.syncRoom,
    videoId,
    label,
  });
}

export function audioStop() {
  if (!_player || !isGM()) return;
  try {
    _player.stopVideo();
    stopSeekBroadcast();
    _currentVideoId = null;
    if (hasFirebase()) {
      publishAudioState({
        firebaseUrl: state.settings.firebaseUrl,
        roomId: state.settings.syncRoom,
        patch: { isPlaying: false, position: 0, videoId: "" },
      });
    }
  } catch { /* */ }
}

export function destroyAudio() {
  disconnectAudioSync();
  stopSeekBroadcast();
  if (_player?.destroy) _player.destroy();
  _player = null;
  _mounted = false;
  _currentVideoId = null;
  _lastRemoteState = {};
}
