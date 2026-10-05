/* Full-screen reader and device-local memory progress; no corridor rules here. */
(function (root) {
  "use strict";
  const data = typeof module === "object" && module.exports ? require("./endingData.js") : root.SchoolEndingData;
  const STORAGE_KEY = "ichinen8_endings_seen";
  const MEMORY_CLASSES = ["1", "2", "3", "4", "5", "6", "7"];
  const ENDING_LIST = Object.freeze([
    ...MEMORY_CLASSES.map(key => Object.freeze({ key, id: `end${key}`, number: key.padStart(2, "0"), name: `記憶${key}` })),
    Object.freeze({ key: "8", id: "end8Normal", number: "08", name: "日常" }),
    Object.freeze({ key: "9", id: "end8True", number: "09", name: "終焉" })
  ]);
  class MemoryAssignments {
    constructor() { this.reset(); }
    reset() { this.nextEndingIndex = 0; this.classEndingAssignments = {}; }
    endingFor(room) {
      if (!MEMORY_CLASSES.includes(String(room))) throw new RangeError("Memory classroom must be 1–7");
      if (this.classEndingAssignments[room] === undefined) this.classEndingAssignments[room] = this.nextEndingIndex++;
      return `end${this.classEndingAssignments[room] + 1}`;
    }
  }
  const TIMING = Object.freeze({ blackout: 300, reveal: 200, finish: 650, darken: 2500, trueFade: 1600, truePause: 800, normalFade: 1600, normalPause: 800 });
  class SeenEndings {
    constructor(storage) {
      this.storage = storage;
      this.seen = new Set();
      this.reload();
    }
    reload() {
      if (!this.storage) return;
      try {
        const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) || "[]");
        if (Array.isArray(saved)) this.seen = new Set(saved.filter(id => ENDING_LIST.some(ending => ending.key === id)));
      } catch (_) { /* A denied/corrupt storage must not prevent playing. */ }
    }
    save() { try { this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.seen].sort())); } catch (_) {} }
    mark(id) { if (ENDING_LIST.some(ending => ending.key === id)) { this.seen.add(id); this.save(); } }
    markAll() { MEMORY_CLASSES.forEach(id => this.seen.add(id)); this.save(); }
    clear() { this.seen.clear(); this.save(); }
    get complete() { return MEMORY_CLASSES.every(id => this.seen.has(id)); }
    endingFor(room) { if (room !== 8) throw new RangeError("Use MemoryAssignments for rooms 1–7"); return this.complete ? "end8True" : "end8Normal"; }
    status() { return ENDING_LIST.map(({key}) => `END${key}：${this.seen.has(key) ? "既読" : "未読"}`).join(" ／ "); }
  }
  class EndingPlayer {
    constructor(document, progress, onReturn) {
      this.progress = progress; this.onReturn = onReturn;
      this.ui = Object.fromEntries(["game-shell", "ending-screen", "ending-background", "ending-shade", "ending-blackout", "ending-text", "ending-finish", "ending-hint", "ending-return", "ending-title"].map(id => [id, document.getElementById(id)]));
      this.active = false;
      this.ui["ending-background"].src = data.background;
      this.ui["ending-screen"].addEventListener("click", () => this.advance());
      this.ui["ending-return"].addEventListener("click", event => { event.stopPropagation(); if (this.finished) this.returnToTitle(); });
      this.ui["ending-title"].addEventListener("click", event => { event.stopPropagation(); if (this.finished) this.returnToTitle("title"); });
    }
    show(id, { preview = false, library = false, returnLabel = null } = {}) {
      if (!data.ENDINGS[id]) throw new Error(`Unknown ending: ${id}`);
      this.ending = data.ENDINGS[id]; this.active = true; this.finished = false;
      this.preview = preview; this.library = library;
      this.ui["ending-return"].textContent = returnLabel || (library ? "エンディングリストへ戻る" : preview ? "デバッグへ戻る" : "タイトルへ戻る");
      this.ui["ending-title"].hidden = preview || library || this.ending.type !== "memory" || !returnLabel;
      this.page = 0; this.elapsed = 0; this.visibleLines = 0; this.endTime = null; this.darkTime = null; this.trueFadeTime = null; this.normalFadeTime = null;
      this.ui["ending-background"].style.filter = this.ending.type === "memory" ? "grayscale(90%) brightness(60%)" : "none";
      this.ui["ending-screen"].classList.remove("ending-dark");
      this.ui["ending-screen"].classList.remove("ending-true-finish");
      this.ui["ending-screen"].classList.remove("ending-normal-finish");
      this.ui["ending-blackout"].style.backgroundColor = "#000";
      this.ui["ending-text"].hidden = false;
      if (this.ending.type === "memory") this.ui["ending-screen"].classList.add("ending-dark");
      this.ui["ending-shade"].style.opacity = this.ending.type === "memory" ? ".45" : "0";
      this.ui["ending-blackout"].style.opacity = "1";
      this.ui["ending-finish"].hidden = true; this.ui["ending-text"].textContent = "";
      this.ui["ending-hint"].hidden = true;
      // Black covers the existing corridor first; then hides its entire shell.
      this.ui["ending-screen"].hidden = false;
      this.ui["ending-screen"].focus({ preventScroll: true });
    }
    get text() { return this.ending.pages[this.page]; }
    get revealed() { return this.ui["ending-text"].textContent === this.text; }
    tick(ms) {
      if (!this.active) return;
      if (this.trueFadeTime !== null || this.normalFadeTime !== null) {
        const normal = this.normalFadeTime !== null;
        const timer = normal ? "normalFadeTime" : "trueFadeTime";
        const fade = normal ? TIMING.normalFade : TIMING.trueFade;
        const pause = normal ? TIMING.normalPause : TIMING.truePause;
        this[timer] += ms;
        this.ui["ending-blackout"].style.opacity = String(Math.min(1, this[timer] / fade));
        if (this[timer] >= fade) this.ui["ending-text"].hidden = true;
        if (this[timer] >= fade + pause) {
          if (!this.finished && !this.preview && !this.library) this.progress.mark(normal ? "8" : "9");
          this.finished = true; this.ui["ending-finish"].hidden = false;
        }
        return;
      }
      const previous = this.elapsed; this.elapsed += ms;
      if (this.elapsed < TIMING.blackout) return;
      this.ui["game-shell"].hidden = true;
      this.ui["ending-blackout"].style.opacity = String(Math.max(0, 1 - (this.elapsed - TIMING.blackout) / TIMING.reveal));
      this.ui["ending-hint"].hidden = this.finished;
      const visibleTime = this.elapsed - Math.max(previous, TIMING.blackout);
      // Only the first line appears when the page opens. Subsequent lines
      // require an explicit click/tap/Enter; elapsed time never reveals them.
      if (this.visibleLines === 0) this.revealNextLine();
      this.checkCompleted();
      if (this.darkTime !== null) {
        this.darkTime += visibleTime;
        this.ui["ending-shade"].style.opacity = String(.55 * Math.min(1, this.darkTime / TIMING.darken));
      }
      if (this.endTime !== null) {
        this.endTime += visibleTime;
        if (this.endTime >= TIMING.finish) {
          this.finished = true; this.ui["ending-finish"].hidden = false; this.ui["ending-hint"].hidden = true;
        }
      }
    }
    revealNextLine() {
      const lines = this.text.split("\n");
      this.visibleLines = Math.min(this.visibleLines + 1, lines.length);
      this.ui["ending-text"].textContent = lines.slice(0, this.visibleLines).join("\n");
      this.checkCompleted();
    }
    checkCompleted() {
      if (this.ending.type !== "memory") return; // Class 8 final text waits for deliberate input.
      if (this.revealed && this.page === this.ending.pages.length - 1 && this.endTime === null) {
        if (this.ending.type === "memory" && !this.preview && !this.library) this.progress.mark(this.ending.memoryClass);
        this.endTime = 0;
      }
    }
    advance() {
      if (!this.active || this.elapsed < TIMING.blackout) return;
      if (this.finished) { this.returnToTitle(); return; }
      if (this.trueFadeTime !== null || this.normalFadeTime !== null) return;
      if (!this.revealed) { this.revealNextLine(); return; }
      if (this.page === this.ending.pages.length - 1) {
        if (this.ending.type === "true") {
          this.trueFadeTime = 0;
          this.ui["ending-hint"].hidden = true;
          this.ui["ending-screen"].classList.add("ending-true-finish");
        } else if (this.ending.type === "normal") {
          this.normalFadeTime = 0;
          this.ui["ending-blackout"].style.backgroundColor = "#fff";
          this.ui["ending-hint"].hidden = true;
          this.ui["ending-screen"].classList.add("ending-normal-finish");
        }
        return;
      }
      this.page++; this.visibleLines = 0;
      this.revealNextLine();
      if (this.ending.darkenFromPage === this.page + 1) {
        this.darkTime = 0; this.ui["ending-screen"].classList.add("ending-dark");
      }
    }
    returnToTitle(target = null) {
      this.active = false; this.ui["ending-screen"].hidden = true; this.ui["game-shell"].hidden = false;
      this.onReturn(this.preview, this.library, target);
    }
  }
  const api = { SeenEndings, MemoryAssignments, EndingPlayer, ENDING_LIST, STORAGE_KEY, TIMING };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchoolEndings = api;
})(typeof globalThis === "object" ? globalThis : this);
