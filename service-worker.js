/* Bump CACHE_VERSION when publishing a game update. No localStorage access. */
"use strict";
const CACHE_VERSION = "v20";
const CACHE_PREFIX = "ichinen8-cache-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const CORE = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./rules.js",
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
const ASSETS = [
  "./assets/audio/school_ambience.mp3",
  "./assets/audio/school_chime.mp3",
  "./assets/audio/fluorescent_hum.mp3",
  "./assets/audio/footstep1.mp3",
  "./assets/audio/footstep2.mp3",
  "./assets/audio/sliding_door.mp3",
  "./assets/images/anomaly_boy_facing.png",
  "./assets/images/anomaly_bulletin_death.png",
  "./assets/images/anomaly_dog.png",
  "./assets/images/anomaly_floor_hole.png",
  "./assets/images/anomaly_floor_stain.png",
  "./assets/images/anomaly_girl_a_facing.png",
  "./assets/images/anomaly_girl_b_facing.png",
  "./assets/images/anomaly_knife.png",
  "./assets/images/anomaly_light_broken.png",
  "./assets/images/anomaly_window_bloodhand.png",
  "./assets/images/anomaly_window_broken.png",
  "./assets/images/bg_hallway.png",
  "./assets/images/boy.png",
  "./assets/images/bulletin_board.png",
  "./assets/images/class_plate.png",
  "./assets/images/door.png",
  "./assets/images/ending_classroom.png",
  "./assets/images/girl_a.png",
  "./assets/images/girl_b.png",
  "./assets/images/light.png",
  "./assets/images/pillar.png",
  "./assets/images/player_idle.png",

  "./assets/images/player_walk_01.png",
  "./assets/images/player_walk_02.png",
  "./assets/images/player_walk_03.png",
  "./assets/images/player_walk_04.png",
  "./assets/images/player_walk_05.png",
  "./assets/images/player_walk_06.png",
  "./assets/images/title_background.png",
  "./assets/images/title_logo.png",
  "./assets/images/window.png"
];
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
