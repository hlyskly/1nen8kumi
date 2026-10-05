/* Presentation only. Fixture crops keep their aspect ratio; player frames
   use full images in one fixed rectangle. No game state or collision data here. */
(function (root) {
  "use strict";
  const ASSETS = Object.freeze(Object.fromEntries([
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
  // Visual authority: サイズ参考.png (2172×724), scaled to canvas height 440.
  // Door/fixture silhouettes and NPC heights follow that composite, not raw PNG dimensions.
  // Keep fixture sizes intact; placement comes from the shared corridor data.
  const SIZES = Object.freeze({ doorHeight: 216, doorBottom: 322,
    personHeight: 278.64, playerWidth: 278.64, girlHeight: 181.5, boyHeight: 200.2,
    playerFoot: 386, playerSoleAnchor: 1470 / 1600, npcFoot: 337, pillarHeight: 291,
    windowWidth: 294, windowCenterY: 190,
    boardWidth: 270, boardCenterY: 164, lightWidth: 187, lightCenterY: 12,
    plateWidth: 83, plateCenterY: 83 });
  const corridor = root.SchoolRules?.CORRIDOR || require("./rules.js").CORRIDOR;
  const doorHalf = SIZES.doorHeight * ASSETS.door.crop[2] / ASSETS.door.crop[3] / 2;
  const LAYOUT = Object.freeze({
    windows: corridor.windows, board: corridor.boards[0], boy: corridor.npcs[2].at - 35,
    lightSpacing: 400,
    zones: Object.freeze([
      ["進入側バッファ", 0, corridor.doors[0] - doorHalf],
      ["前扉", corridor.doors[0] - doorHalf, corridor.windows[0] - SIZES.windowWidth / 2],
      ["窓列", corridor.windows[0] - SIZES.windowWidth / 2, corridor.windows[2] + SIZES.windowWidth / 2],
      ["後扉", corridor.windows[2] + SIZES.windowWidth / 2, corridor.doors[1] + doorHalf],
      ["壁", corridor.doors[1] + doorHalf, corridor.boards[0] - SIZES.boardWidth / 2],
      ["掲示板", corridor.boards[0] - SIZES.boardWidth / 2, corridor.boards[0] + SIZES.boardWidth / 2],
      ["境界バッファ", corridor.boards[0] + SIZES.boardWidth / 2, 3700]
    ].map(([name, start, end]) => Object.freeze({ name, start, end, width: end - start })))
  });
  // Only one selected rule ID is rendered. Fixture replacements inherit their
  // normal rectangle; floor additions have independent static display sizes.
  const ANOMALY_VISUALS = Object.freeze(Object.fromEntries([
    ["light", { target: "lamp", asset: "brokenLight", mode: "replace", scope: "block" }],
    ["brokenWindow", { target: "window", asset: "brokenWindow", mode: "overlay" }],
    ["handprint", { target: "window", asset: "bloodWindow", mode: "replace" }],
    ["deathNotice", { target: "board", asset: "deathBoard", mode: "replace" }],
    ["blood", { target: "floor", asset: "floorBlood", mode: "overlay", width: 280, centerY: SIZES.playerFoot }],
    ["knife", { target: "floor", asset: "knife", mode: "overlay", width: 51.84, centerY: SIZES.playerFoot }],
    ["hole", { target: "floor", asset: "floorHole", mode: "overlay", width: 210, centerY: SIZES.playerFoot }],
    ["dog", { target: "floor", asset: "dog", mode: "overlay", height: 118, foot: SIZES.playerFoot - 10 }],
    ["girlsLooking", { target: "npc", mode: "replace", girlA: "girlAFacing", girlB: "girlBFacing" }],
    ["boyLooking", { target: "npc", mode: "replace", boy: "boyFacing" }]
  ].map(([id, visual]) => [id, Object.freeze(visual)])));
  class SpriteSet {
    constructor(onReady, onError) {
      this.images = {};
      this.pending = Object.keys(ASSETS).length;
      this.failed = false;
      for (const [key, asset] of Object.entries(ASSETS)) {
        const image = new Image();
        this.images[key] = image;
        image.onload = () => { if (--this.pending === 0 && !this.failed) onReady(); };
        image.onerror = () => { this.failed = true; onError(asset.file); };
        image.src = `assets/images/${asset.file}`;
      }
    }
    dimensions(key, { width, height }) {
      const [, , sourceWidth, sourceHeight] = ASSETS[key].crop || [0, 0, SIZES.playerWidth, SIZES.personHeight];
      if (width === undefined) width = height * sourceWidth / sourceHeight;
      else if (height === undefined) height = width * sourceHeight / sourceWidth;
      return { width, height };
    }
    draw(ctx, key, centerX, top, size, flip = false) {
      const image = this.images[key];
      if (!image.complete || !image.naturalWidth) return;
      const { width, height } = this.dimensions(key, size);
      ctx.save(); ctx.translate(centerX, top); ctx.scale(flip ? -1 : 1, 1);
      if (ASSETS[key].crop) ctx.drawImage(image, ...ASSETS[key].crop, -width / 2, 0, width, height);
      else ctx.drawImage(image, -width / 2, 0, width, height);
      ctx.restore();
    }
  }
  const api = Object.freeze({ ASSETS, SIZES, LAYOUT, ANOMALY_VISUALS, SpriteSet });
  root.SchoolArt = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
