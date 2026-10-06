/* Optional presentation audio. Playback failures never block the game. */
(function (root) {
  "use strict";
  const CONFIG = typeof module === "object" && module.exports ? require("./config.js") : root.GAME_CONFIG;
  const AUDIO_VOLUME = CONFIG.baseVolumes;
  const CATEGORY = Object.freeze({ ambience: "ambientVolume", fluorescent: "lightVolume", footstep1: "footstepVolume", footstep2: "footstepVolume", door: "doorVolume", chime: "chimeVolume" });
  const FILES = (typeof module === "object" && module.exports ? require("./assetData.js") : root.SchoolAssets).AUDIO_FILES;
  class GameAudio {
    constructor(host = root) {
      this.host = host; this.buffers = {}; this.loops = new Map();
      this.playing = false; this.walkFrame = null;
      // Fetch before play, but create/resume the audio context only in a gesture.
      this.files = Object.fromEntries(Object.entries(FILES).map(([id, file]) => [id,
        Promise.resolve().then(() => host.fetch(`assets/audio/${file}`))
          .then(response => { if (!response.ok) throw new Error("Audio unavailable"); return response.arrayBuffer(); })
          .catch(() => null)
      ]));
    }
    unlock() {
      try {
        if (!this.context) {
          const Context = this.host.AudioContext || this.host.webkitAudioContext;
          if (!Context) return;
          this.context = new Context();
          for (const [id, file] of Object.entries(this.files)) {
            file.then(bytes => bytes && this.context.decodeAudioData(bytes))
              .then(buffer => { if (buffer) { this.buffers[id] = buffer; this.syncLoops(); this.tryChime(); } })
              .catch(() => {});
          }
        }
        // Called synchronously from click/tap/Enter, before the title fade.
        Promise.resolve(this.context.resume()).then(() => { this.syncLoops(); this.tryChime(); }).catch(() => {});
      } catch (_) { /* Unsupported/denied audio must remain optional. */ }
    }
    source(id, volume, loop = false) {
      if (!this.buffers[id] || this.context?.state !== "running") return null;
      try {
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = this.buffers[id]; source.loop = loop;
        gain.gain.value = Math.max(0, Math.min(1, volume * CONFIG.masterVolume * CONFIG[CATEGORY[id]]));
        source.connect(gain); gain.connect(this.context.destination);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        source.start(0); // A fresh source always plays from the beginning.
        return source;
      } catch (_) { return null; }
    }
    stop(source) { try { source?.stop(); } catch (_) {} }
    syncLoops() {
      if (!this.playing) return;
      for (const id of ["ambience", "fluorescent"]) {
        if (!this.loops.has(id)) {
          const source = this.source(id, AUDIO_VOLUME[id], true);
          if (source) this.loops.set(id, source);
        }
      }
    }
    startGameAmbience() { this.playing = true; this.syncLoops(); }
    stopGameAmbience() {
      this.playing = false;
      for (const source of this.loops.values()) this.stop(source);
      this.loops.clear(); this.resetWalking();
    }
    resetWalking() { this.walkFrame = null; this.stop(this.step); this.step = null; }
    updateWalking(frame) {
      if (frame === null) { this.resetWalking(); return; }
      if (!this.playing || frame === this.walkFrame) return;
      this.walkFrame = frame;
      if (frame === 0 || frame === 3) {
        this.stop(this.step);
        this.step = this.source(frame === 0 ? "footstep1" : "footstep2", AUDIO_VOLUME.footstep);
      }
    }
    // One request per title start, independent of walking and ambience stop.
    armChime() { this.chimeRequested = false; }
    playChime() {
      if (this.chimeRequested) return;
      this.chimeRequested = true; this.chimePending = true;
      this.stop(this.chime); this.chime = null;
      this.tryChime();
    }
    tryChime() {
      if (!this.chimePending) return;
      const source = this.source("chime", AUDIO_VOLUME.chime);
      if (source) { this.chime = source; this.chimePending = false; }
    }
    playDoorSound() { this.stop(this.door); this.door = this.source("door", AUDIO_VOLUME.door); }
  }
  const api = { GameAudio, AUDIO_VOLUME, FILES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchoolAudio = api;
})(typeof globalThis === "object" ? globalThis : this);
