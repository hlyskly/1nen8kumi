/* Presentation only. Fixture crops keep their aspect ratio; player frames
   use full images in one fixed rectangle. No game state or collision data here. */
(function (root) {
  "use strict";
  const ASSETS = (typeof module === "object" && module.exports ? require("./assetData.js") : root.SchoolAssets).SPRITES;
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
