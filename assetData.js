/* Shared runtime image/audio definitions; also loaded by the Service Worker. */
(function (root) {
  "use strict";
  const SPRITES = Object.freeze(Object.fromEntries([
    ["background", "bg_hallway.png", [0, 0, 2172, 724]],
    ["door", "door.png", [116, 29, 1047, 1137]],
    ["pillar", "pillar.png", [293, 55, 439, 1434]],
    ["window", "window.png", [11, 59, 1514, 880]],
    ["light", "light.png", [75, 220, 2022, 254]],
    ["board", "bulletin_board.png", [20, 221, 1408, 619]],
    ["plate", "class_plate.png", [84, 149, 1947, 449]],
    // Player frames use full images and one fixed destination rectangle.
    ["player", "player_idle.png", null],
    ["playerWalk1", "player_walk_01.png", null],
    ["playerWalk2", "player_walk_02.png", null],
    ["playerWalk3", "player_walk_03.png", null],
    ["playerWalk4", "player_walk_04.png", null],
    ["playerWalk5", "player_walk_05.png", null],
    ["playerWalk6", "player_walk_06.png", null],
    ["girlA", "girl_a.png", [318, 45, 341, 1411]],
    ["girlB", "girl_b.png", [376, 23, 308, 1485]],
    ["boy", "boy.png", [332, 49, 379, 1439]],
    ["brokenLight", "anomaly_light_broken.png", [73, 214, 2027, 257]],
    ["brokenWindow", "anomaly_window_broken.png", [11, 60, 1515, 880]],
    ["bloodWindow", "anomaly_window_bloodhand.png", [11, 59, 1516, 882]],
    ["deathBoard", "anomaly_bulletin_death.png", [20, 219, 1410, 621]],
    ["floorBlood", "anomaly_floor_stain.png", [3, 356, 2140, 324]],
    ["knife", "anomaly_knife.png", [47, 64, 2046, 598]],
    ["floorHole", "anomaly_floor_hole.png", [18, 151, 1497, 727]],
    ["dog", "anomaly_dog.png", [152, 31, 955, 1186]],
    ["girlAFacing", "anomaly_girl_a_facing.png", [315, 42, 348, 1415]],
    ["girlBFacing", "anomaly_girl_b_facing.png", [377, 23, 309, 1485]],
    ["boyFacing", "anomaly_boy_facing.png", [332, 31, 381, 1458]]
  ].map(([key, file, crop]) => [key, Object.freeze({ file, crop: Object.freeze(crop) })])));
  const AUDIO_FILES = Object.freeze({ ambience: "school_ambience.mp3", fluorescent: "fluorescent_hum.mp3", footstep1: "footstep1.mp3", footstep2: "footstep2.mp3", door: "sliding_door.mp3", chime: "school_chime.mp3" });
  const TITLE_IMAGES = Object.freeze(["title_background.png", "title_logo.png"]);
  const PATHS = Object.freeze([...new Set([
    ...Object.values(SPRITES).map(asset => `./assets/images/${asset.file}`),
    ...TITLE_IMAGES.map(file => `./assets/images/${file}`),
    "./assets/images/ending_classroom.png",
    ...Object.values(AUDIO_FILES).map(file => `./assets/audio/${file}`)
  ])]);
  const api = Object.freeze({ SPRITES, AUDIO_FILES, TITLE_IMAGES, PATHS });
  root.SchoolAssets = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis === "object" ? globalThis : this);
