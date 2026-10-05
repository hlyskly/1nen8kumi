/* Install UI only; no game state or END storage changes. */
(function () {
  "use strict";
  const button = document.getElementById("pwa-install");
  const guide = document.getElementById("pwa-guide");
  const close = document.getElementById("pwa-guide-close");
  const displayMode = window.matchMedia("(display-mode: standalone)");
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let deferredPrompt = null, installed = false, prompting = false;
  function refresh() {
    button.hidden = installed || displayMode.matches || navigator.standalone === true;
    if (button.hidden && guide.open) guide.close();
  }
  function explain() {
    const steps = ios ? ["Safariの共有ボタンをタップ", "「ホーム画面に追加」を選択", "「追加」をタップ"] :
      ["ブラウザのメニューを開く", "「アプリをインストール」または「ホーム画面に追加」を選択", "画面の案内に従って追加"];
    document.getElementById("pwa-guide-steps").replaceChildren(...steps.map(text => {
      const item = document.createElement("li"); item.textContent = text; return item;
    }));
    const otherIOSBrowser = ios && /CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
    document.getElementById("pwa-guide-note").textContent = ios ?
      (otherIOSBrowser ? "追加項目が見つからない場合はSafariで開いてください。" : "追加後はホーム画面の「8」アイコンから起動し、横向きで遊んでください。") :
      "追加項目がない場合は、Chromeなどの対応ブラウザで開いてください。";
    guide.showModal(); close.focus();
  }
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); deferredPrompt = event; refresh();
  });
  window.addEventListener("appinstalled", () => {
    installed = true; deferredPrompt = null; refresh();
  });
  displayMode.addEventListener?.("change", refresh);
  window.addEventListener("pageshow", refresh);
  button.addEventListener("click", async () => {
    if (button.hidden || prompting) return;
    if (ios || !deferredPrompt) { explain(); return; }
    const prompt = deferredPrompt; deferredPrompt = null;
    prompting = true; button.disabled = true;
    try {
      await prompt.prompt(); await prompt.userChoice;
    } catch (_) { explain(); }
    finally { prompting = false; button.disabled = false; refresh(); }
  });
  close.addEventListener("click", () => guide.close());
  guide.addEventListener("close", () => { if (!button.hidden) button.focus(); });
  // Keep the game's title Enter shortcut from starting behind the install UI.
  // Native keyboard activation of these buttons still works.
  document.addEventListener("keydown", event => {
    if (guide.open || prompting || event.target === button) event.stopImmediatePropagation();
  }, true);
  refresh();
  // file:// remains playable; registration errors never prevent game startup.
  if ("serviceWorker" in navigator && window.isSecureContext && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js", { scope: "./", updateViaCache: "none" })
        .catch(() => { /* Ordinary browser play remains available. */ });
    });
  }
})();
