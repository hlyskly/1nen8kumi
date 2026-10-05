/* Title presentation only. Run.start and the existing SeenEndings own game/progress. */
(function (root) {
  "use strict";
  const FADE_MS = 250;
  class TitleScreen {
    constructor(document, progress, canStart, onStart, onBegin = () => {}) {
      this.progress = progress; this.canStart = canStart; this.onStart = onStart; this.onBegin = onBegin;
      this.ui = Object.fromEntries(["title-screen", "title-start", "title-memory", "title-status", "game-shell", "title-ending-list", "ending-list", "ending-list-items", "ending-list-back", "ending-list-actions", "ending-list-delete", "ending-delete-confirm", "ending-delete-yes", "ending-delete-cancel"].map(id => [id, document.getElementById(id)]));
      this.share = new root.SchoolShare.TitleShare(document, root.window || root, () => this.active && !this.leaving && !this.listOpen);
      this.active = false; this.leaving = false; this.assetsReady = false;
      this.ui["title-start"].disabled = true;
      this.ui["title-start"].addEventListener("click", () => this.begin());
      this.ui["title-ending-list"].addEventListener("click", () => this.showList());
      this.ui["ending-list-back"].addEventListener("click", () => this.closeList());
      this.ui["ending-list-delete"].addEventListener("click", () => {
        if (!this.listOpen || this.deleting) return;
        this.deleting = true;
        this.ui["ending-list-items"].hidden = true;
        this.ui["ending-list-actions"].hidden = true;
        this.ui["ending-delete-confirm"].hidden = false;
        this.ui["ending-delete-cancel"].focus({ preventScroll: true });
      });
      this.ui["ending-delete-cancel"].addEventListener("click", () => {
        if (!this.deleting) return;
        this.showList();
        this.ui["ending-list-delete"].focus({ preventScroll: true });
      });
      this.ui["ending-delete-yes"].addEventListener("click", () => {
        if (!this.listOpen || !this.deleting) return;
        this.progress.clear(); // Only the existing ending-unlock storage key.
        this.showList();
      });
      let loaded = 0;
      this.images = ["title_background.png", "title_logo.png"].map(file => {
        const image = new Image();
        image.onload = () => { loaded++; this.assetsReady = loaded === 2; this.refreshReady(); };
        image.onerror = () => { this.failed = true; this.ui["title-status"].textContent = "画像を読み込めませんでした。ページを再読み込みしてください。"; this.refreshReady(); };
        image.src = `assets/images/${file}`;
        return image;
      });
    }
    refreshReady() {
      const ready = this.assetsReady && this.canStart() && !this.failed;
      this.ui["title-start"].disabled = !ready || this.leaving;
      if (ready) this.ui["title-status"].hidden = true;
    }
    show() {
      this.progress.reload();
      this.ui["title-memory"].textContent = `エンディング ${this.progress.seen.size}/9`;
      this.share.close();
      this.closeList();
      this.active = true; this.leaving = false; this.fadeElapsed = 0;
      this.ui["title-screen"].classList.remove("title-leaving");
      this.ui["title-screen"].hidden = false;
      this.ui["game-shell"].hidden = true;
      this.refreshReady(); this.ui["title-start"].focus({ preventScroll: true });
    }
    showList() {
      if (!this.active || this.leaving || this.share.open || this.share.busy) return;
      this.progress.reload();
      this.ui["title-memory"].textContent = `エンディング ${this.progress.seen.size}/9`;
      this.ui["game-shell"].hidden = true;
      this.deleting = false;
      this.ui["ending-delete-confirm"].hidden = true;
      this.ui["ending-list-actions"].hidden = false;
      this.ui["ending-list-items"].hidden = false;
      this.ui["ending-list-items"].replaceChildren();
      for (const ending of root.SchoolEndings.ENDING_LIST) {
        const button = this.ui["ending-list-items"].ownerDocument.createElement("button");
        const unlocked = this.progress.seen.has(ending.key);
        button.type = "button"; button.disabled = !unlocked;
        button.textContent = `${ending.number}　${unlocked ? ending.name : "？？？？？"}`;
        button.addEventListener("click", () => { if (!this.deleting && this.progress.seen.has(ending.key)) this.onReplay?.(ending.id); });
        this.ui["ending-list-items"].appendChild(button);
      }
      this.ui["ending-list"].hidden = false;
      this.listOpen = true;
      this.ui["ending-list-back"].focus({ preventScroll: true });
    }
    closeList() { this.deleting = false; this.ui["ending-delete-confirm"].hidden = true; this.listOpen = false; this.ui["ending-list"].hidden = true; }
    begin() {
      if (!this.active || this.listOpen || this.share.open || this.share.busy || this.leaving || !this.assetsReady || !this.canStart() || this.failed) return;
      this.onBegin();
      this.leaving = true; this.fadeElapsed = 0;
      this.ui["title-start"].disabled = true;
      this.ui["title-screen"].classList.add("title-leaving");
      this.ui["game-shell"].hidden = false;
    }
    tick(ms) {
      if (!this.active || !this.leaving) return;
      this.fadeElapsed += ms;
      if (this.fadeElapsed < FADE_MS) return;
      this.active = false; this.leaving = false;
      this.ui["title-screen"].hidden = true;
      this.onStart();
    }
  }
  const api = { TitleScreen, FADE_MS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchoolTitle = api;
})(typeof globalThis === "object" ? globalThis : this);
