/* Bump CACHE_VERSION when publishing a game update. No localStorage access. */
"use strict";
importScripts("./assetData.js");
const CACHE_VERSION = "v21";
const CACHE_PREFIX = "ichinen8-cache-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./rules.js",
  "./assetData.js",
  "./art.js",
  "./endingData.js",
  "./endings.js",
  "./shareData.js",
  "./share.js",
  "./title.js",
  "./pwa.js",
  "./howToPlayData.js",
  "./game.js",
  "./audio.js",
  "./manifest.webmanifest",
  "./assets/images/title_background.png",
  "./assets/images/title_logo.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];
const ASSETS = SchoolAssets.PATHS;
const ALLOWED = new Set([...CORE, ...ASSETS].map(path => new URL(path, self.registration.scope).href));
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE.map(path => new Request(path, { cache: "reload" })))));
  // Do not replace an active worker or reload the game mid-round.
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const navigation = request.mode === "navigate" && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (!navigation && !ALLOWED.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Online always uses fresh content; cached copies are offline fallbacks.
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok && response.type === "basic") {
        try { await cache.put(navigation ? new URL("./index.html", self.registration.scope).href : request, response.clone()); }
        catch (_) { /* A full/denied cache must not block the network response. */ }
      }
      return response;
    } catch (error) {
      const cached = await cache.match(navigation ? new URL("./index.html", self.registration.scope).href : request);
      if (cached) return cached;
      throw error;
    }
  })());
});
