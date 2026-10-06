/* タイトル画面専用の共有。ゲームや保存データを変更しません。 */
(function (root) {
  "use strict";
  function payload(data, href) {
    const fixed = typeof data.url === "string" && data.url.trim();
    const url = new URL(fixed || href, href);
    if (!fixed) { url.search = ""; url.hash = ""; }
    return { title: data.title, text: data.text, url: url.href };
  }
  function links(data) {
    const params = new URLSearchParams({ text: data.text, url: data.url });
    return {
      mail: `mailto:?subject=${encodeURIComponent(data.title)}&body=${encodeURIComponent(`${data.text}\r\n\r\n${data.url}`)}`,
      line: `https://social-plugins.line.me/lineit/share?${params}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: data.url })}`,
      x: `https://twitter.com/intent/tweet?${params}`
    };
  }
  class TitleShare {
    constructor(document, host, canShare, data = root.SHARE_DATA) {
      this.document = document; this.host = host; this.canShare = canShare; this.data = data;
      this.busy = false; this.copying = false;
      this.ui = Object.fromEntries(["title-share", "share-menu", "share-mail", "share-line", "share-facebook", "share-x", "share-copy", "share-close", "share-message", "share-url"].map(id => [id, document.getElementById(id)]));
      this.ui["title-share"].addEventListener("click", () => this.share());
      this.ui["share-close"].addEventListener("click", () => this.close());
      this.ui["share-copy"].addEventListener("click", () => this.copy());
      this.ui["share-menu"].addEventListener("close", () => this.ui["title-share"].focus({ preventScroll: true }));
    }
    get open() { return !!this.ui["share-menu"].open; }
    current() { return payload(this.data, this.host.location.href); }
    async share() {
      if (!this.canShare() || this.busy || this.open) return;
      this.busy = true; this.ui["title-share"].disabled = true;
      try {
        const data = this.current();
        if (typeof this.host.navigator?.share === "function") {
          try {
            // ユーザーのクリック・タップ内で直接開始します。
            await this.host.navigator.share(data);
            return;
          } catch (error) {
            if (error?.name === "AbortError") return; // キャンセルは通知しません。
          }
        }
        this.showMenu(data);
      } catch (_) { /* 共有エラーでゲームを停止させません。 */ }
      finally { this.busy = false; this.ui["title-share"].disabled = false; }
    }
    showMenu(data) {
      const urls = links(data);
      for (const id of ["mail", "line", "facebook", "x"]) this.ui[`share-${id}`].href = urls[id];
      this.ui["share-url"].value = data.url; this.ui["share-url"].hidden = true;
      this.ui["share-message"].textContent = "";
      const dialog = this.ui["share-menu"];
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      this.ui["share-copy"].focus({ preventScroll: true });
    }
    close() {
      if (!this.open) return;
      const dialog = this.ui["share-menu"];
      if (typeof dialog.close === "function") dialog.close();
      else { dialog.removeAttribute("open"); this.ui["title-share"].focus({ preventScroll: true }); }
    }
    legacyCopy(url) {
      const field = this.document.createElement("textarea");
      field.value = url; field.readOnly = true;
      field.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none";
      this.ui["share-menu"].appendChild(field);
      try { field.focus(); field.select(); return !!this.document.execCommand?.("copy"); }
      catch (_) { return false; }
      finally { field.remove(); this.ui["share-copy"].focus({ preventScroll: true }); }
    }
    async copy() {
      if (!this.open || this.copying) return;
      this.copying = true;
      try {
        const url = this.current().url;
        let copied = false;
        try {
          if (typeof this.host.navigator?.clipboard?.writeText === "function") {
            await this.host.navigator.clipboard.writeText(url); copied = true;
          }
        } catch (_) {}
        if (!copied) copied = this.legacyCopy(url);
        this.ui["share-message"].textContent = copied ? "リンクをコピーしました" : "URLを選択してコピーしてください。";
        if (!copied) { this.ui["share-url"].hidden = false; this.ui["share-url"].focus(); this.ui["share-url"].select(); }
      } catch (_) { this.ui["share-message"].textContent = "コピーできませんでした。"; }
      finally { this.copying = false; }
    }
  }
  const api = { TitleShare, payload, links };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SchoolShare = api;
})(typeof globalThis === "object" ? globalThis : this);
