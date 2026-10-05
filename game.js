/* Rendering, UI, and input. Static image mappings live in SchoolArt.ANOMALY_VISUALS. */
(function () {
  "use strict";
  const { Run, WORLD, CORRIDOR, ANOMALIES, blockX, cameraX } = SchoolRules;
  const run = new Run();
  const audio = new SchoolAudio.GameAudio();
  const FORCE_ANOMALY = null; // null / "NORMAL" / "dog" / other existing rule ID. Only the first tutorial stays NORMAL.
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const ui = Object.fromEntries(["brand", "goal-instructions", "class-plates", "asset-status", "debug", "debug-controls", "debug-anomaly", "debug-restart", "debug-endings-status", "debug-endings-all", "debug-endings-clear", "debug-ending", "debug-ending-preview", "overlay", "overlay-title", "overlay-body", "overlay-eyebrow", "primary-button", "help-button", "left-button", "up-button", "right-button"].map(id => [id, document.getElementById(id)]));
  const ownClass = `1年${WORLD.finalRoom}組`;
  const otherClasses = `1〜${WORLD.finalRoom - 1}組`;
  document.title = `${ownClass} — 廊下の異変を見つけるゲーム`;
  ui["overlay-title"].textContent = ownClass;
  ui["goal-instructions"].innerHTML = `一本の廊下を歩いて、自分の教室を探そう。<br>${otherClasses}には入らず、異変のない${WORLD.finalRoom}組の後扉で入室。`;
  const W = 960, H = 440, FLOOR = 341;
  const keys = new Set();
  const pointers = new Map();
  let overlayAction = null;
  let helpOpen = false;
  let debug = false;
  let camera = 0;
  let facing = 1;
  let walk = 0; // Elapsed walking seconds; shared by keys and touch.
  let playerMoving = false;
  const PLAYER_FRAMES = ["playerWalk1", "playerWalk2", "playerWalk3", "playerWalk4", "playerWalk5", "playerWalk6"];
  const PLAYER_FRAME_SECONDS = .120 / (GAME_CONFIG.walkSpeed > 0 ? GAME_CONFIG.walkSpeed : 1);
  let textDirection = 1;
  let lastTime = null;
  const font = '"Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
  const playButtons = [ui["left-button"], ui["up-button"], ui["right-button"]];
  const { SIZES, LAYOUT, ANOMALY_VISUALS, SpriteSet } = SchoolArt;
  const PLAYER_DRAW_SIZE = Object.freeze({ width: SIZES.playerWidth, height: SIZES.personHeight });
  const plateLabels = new Map();
  let assetsReady = false;
  ui["primary-button"].disabled = true;
  const art = new SpriteSet(() => {
    assetsReady = true;
    ui["primary-button"].disabled = false;
    ui["asset-status"].hidden = true;
  }, () => {
    ui["asset-status"].hidden = false;
    ui["asset-status"].textContent = "画像を読み込めませんでした。ページを再読み込みしてください。";
    document.getElementById("title-status").textContent = ui["asset-status"].textContent;
  });

  function clearInput() {
    keys.clear(); pointers.clear(); walk = 0; playerMoving = false;
    audio.resetWalking();
    playButtons.forEach(button => button.classList.remove("pressed"));
  }
  function showOverlay(title, eyebrow, body, button, action) {
    clearInput();
    ui["overlay-title"].textContent = title;
    ui["overlay-eyebrow"].textContent = eyebrow;
    ui["overlay-body"].innerHTML = body;
    ui["primary-button"].textContent = button;
    ui.overlay.hidden = false;
    playButtons.forEach(item => { item.disabled = true; });
    overlayAction = action;
    ui["primary-button"].focus({ preventScroll: true });
  }
  function hideOverlay() {
    clearInput();
    ui.overlay.hidden = true;
    playButtons.forEach(item => { item.disabled = false; });
    overlayAction = null;
    helpOpen = false;
  }
  function startGame() {
    if (!assetsReady) return;
    memoryAssignments.reset();
    run.start();
    audio.startGameAmbience();
    if (FORCE_ANOMALY !== null) run.setDebugAnomaly(FORCE_ANOMALY);
    facing = 1; walk = 0; playerMoving = false;
    hideOverlay();
  }
  let storage;
  try { storage = window.localStorage; } catch (_) {}
  const memoryAssignments = new SchoolEndings.MemoryAssignments();
  const seenEndings = new SchoolEndings.SeenEndings(storage);
  const titleScreen = new SchoolTitle.TitleScreen(document, seenEndings, () => assetsReady, showStartHelp, () => { audio.unlock(); audio.playChime(); });
  const endingPlayer = new SchoolEndings.EndingPlayer(document, seenEndings, (preview, library, target) => {
    if (library) { titleScreen.showList(); return; }
    if (preview) {
      hideOverlay();
      audio.startGameAmbience();
      ui.debug.hidden = !debug; ui["debug-controls"].hidden = !debug;
      return;
    }
    if (endingPlayer.ending.type === "memory" && target !== "title") {
      run.phase = "corridor"; run.enteredRoom = null;
      hideOverlay(); audio.startGameAmbience();
      ui.debug.hidden = !debug; ui["debug-controls"].hidden = !debug;
      return;
    }
    clearInput(); run.reset(); facing = 1; debug = false;
    ui.debug.hidden = true; ui["debug-controls"].hidden = true;
    ui["debug-anomaly"].value = "";
    hideOverlay();
    playButtons.forEach(item => { item.disabled = true; });
    audio.stopGameAmbience();
    audio.armChime();
    titleScreen.show();
  });
  titleScreen.onReplay = id => {
    clearInput(); audio.stopGameAmbience();
    // Reuse the same reader without assignment, game reset or unlock writes.
    endingPlayer.show(id, { library: true });
  };
  function interact() {
    if (!ui.overlay.hidden || endingPlayer.active || titleScreen.active) return;
    const result = run.enter();
    if (result.type === "gameover" || result.type === "end") {
      clearInput();
      playButtons.forEach(item => { item.disabled = true; });
      ui.debug.hidden = true; ui["debug-controls"].hidden = true;
      audio.stopGameAmbience();
      audio.playDoorSound();
      endingPlayer.show(result.room === 8 ? seenEndings.endingFor(8) : memoryAssignments.endingFor(result.room),
        { returnLabel: result.room === 8 ? null : "廊下へ戻る" });
    }
  }
  // 開始前・プレイ中の遊び方を同じデータと表示処理で描画します。
  function renderHelp(action, buttonText = HOW_TO_PLAY_DATA.buttonText) {
    // 正の数値をpxとしてCSSへ渡します。未指定・無効値は従来サイズへ戻します。
    for (const [key, cssName, fallback] of [
      ["titleSize", "--help-title-size", "clamp(30px, 4.4vw, 48px)"],
      ["bodySize", "--help-body-size", "13px"],
      ["mobileTitleSize", "--help-mobile-title-size", "28px"],
      ["mobileBodySize", "--help-mobile-body-size", "11px"]
    ]) {
      const value = HOW_TO_PLAY_DATA[key];
      ui.overlay.style.setProperty(cssName, Number.isFinite(value) && value > 0 ? `${value}px` : fallback);
    }
    showOverlay(HOW_TO_PLAY_DATA.title, "", "", buttonText, action);
    for (const line of HOW_TO_PLAY_DATA.lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      ui["overlay-body"].appendChild(paragraph);
    }
  }
  function showStartHelp() {
    // 本編の初期化は「ゲーム開始」を押すまで実行しません。
    renderHelp(startGame);
  }
  function showHelp() {
    if (!ui.overlay.hidden || endingPlayer.active || titleScreen.active) return;
    helpOpen = true;
    renderHelp(hideOverlay, "閉じる");
  }

  ui["primary-button"].addEventListener("click", () => { if (overlayAction) overlayAction(); });
  ui["help-button"].addEventListener("click", showHelp);
  titleScreen.show();
  playButtons.forEach(item => { item.disabled = true; });
  ui["debug-anomaly"].innerHTML += ANOMALIES.map(item => `<option value="${item.id}">${item.code}：${item.label}</option>`).join("");
  ui["debug-anomaly"].value = "";
  ui["debug-anomaly"].addEventListener("change", () => {
    if (debug) run.setDebugAnomaly(ui["debug-anomaly"].value || null);
  });
  ui["debug-restart"].addEventListener("click", () => {
    if (debug && ui.overlay.hidden) { clearInput(); run.restartDebugBlock(); }
  });

  ui["debug-endings-all"].addEventListener("click", () => { if (debug && !endingPlayer.active) { seenEndings.markAll(); updateUI(); } });
  ui["debug-endings-clear"].addEventListener("click", () => { if (debug && !endingPlayer.active) { seenEndings.clear(); updateUI(); } });

  ui["debug-ending"].innerHTML = Object.values(SchoolEndingData.ENDINGS).map(ending => {
    const label = ending.type === "memory" ? `${ending.memoryClass}組END` : ending.type === "true" ? "8組 真END" : "8組 通常END";
    return `<option value="${ending.id}">${label}</option>`;
  }).join("");
  ui["debug-ending"].value = "end1";
  ui["debug-ending-preview"].addEventListener("click", () => {
    if (!debug || run.phase !== "corridor" || !ui.overlay.hidden || titleScreen.active || endingPlayer.active) return;
    clearInput(); playButtons.forEach(item => { item.disabled = true; });
    ui.debug.hidden = true; ui["debug-controls"].hidden = true;
    audio.stopGameAmbience();
    endingPlayer.show(ui["debug-ending"].value, { preview: true });
  });

  document.addEventListener("keydown", event => {
    // 共有操作のEnterを「はじめる」として処理しません。
    if (titleScreen.share.open || titleScreen.share.busy || event.target === titleScreen.share.ui["title-share"]) return;
    if (titleScreen.active && !endingPlayer.active) {
      if (titleScreen.listOpen) { if (event.key === "Escape") titleScreen.closeList(); return; }
      if (event.key === "Enter" || event.key === "Return" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (!event.repeat && !event.isComposing) { clearInput(); titleScreen.begin(); }
      } else if (event.key.startsWith("Arrow")) event.preventDefault();
      return;
    }
    if (endingPlayer.active) {
      if (event.key === "Enter" || event.key === "Return" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (!event.repeat && !event.isComposing) endingPlayer.advance();
      } else if (event.key.startsWith("Arrow")) event.preventDefault();
      return;
    }
    // Do not turn select navigation/activation into player input.
    const inDebugControl = event.target === ui["debug-anomaly"] || event.target === ui["debug-restart"] || event.target === ui["debug-endings-all"] || event.target === ui["debug-endings-clear"] || event.target === ui["debug-ending"] || event.target === ui["debug-ending-preview"];
    if (inDebugControl && event.code !== "KeyD") return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
    if (event.code === "KeyD" && !event.repeat) {
      debug = !debug; ui.debug.hidden = !debug; ui["debug-controls"].hidden = !debug;
      clearInput();
      if (!debug) { run.setDebugAnomaly(null); ui["debug-anomaly"].value = ""; }
    }
    if (event.key === "Escape" && helpOpen) { hideOverlay(); return; }
    if (!ui.overlay.hidden) {
      if ((event.key === "Enter" || event.key === "Return" || event.code === "NumpadEnter" || event.key === "ArrowUp") && !event.repeat) { event.preventDefault(); if (overlayAction) overlayAction(); }
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") keys.add(event.key);
    if (event.key === "ArrowUp" && !event.repeat) interact();
  });
  document.addEventListener("keyup", event => { keys.delete(event.key); });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => { clearInput(); lastTime = null; });
  for (const [id, direction] of [["left-button", -1], ["right-button", 1]]) {
    const button = ui[id];
    button.addEventListener("pointerdown", event => {
      if (!ui.overlay.hidden || endingPlayer.active || titleScreen.active) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, direction);
      button.classList.add("pressed");
    });
    const release = event => {
      pointers.delete(event.pointerId);
      if (![...pointers.values()].includes(direction)) button.classList.remove("pressed");
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("contextmenu", event => event.preventDefault());
  }
  ui["up-button"].addEventListener("click", interact);
  ui["up-button"].addEventListener("contextmenu", event => event.preventDefault());

  function rect(x, y, width, height, color) { ctx.fillStyle = color; ctx.fillRect(x, y, width, height); }
  function line(x1, y1, x2, y2, color, width = 1) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  function text(value, x, y, size = 14, color = "#384e49", align = "left", weight = "normal") {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align;
    if (textDirection === -1) {
      ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.fillText(value, 0, 0); ctx.restore();
    } else ctx.fillText(value, x, y);
  }
  function ellipse(x, y, rx, ry, color) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function polygon(points, color) { ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }

  function drawPillar(at) {
    art.draw(ctx, "pillar", at, SIZES.doorBottom - SIZES.pillarHeight, { height: SIZES.pillarHeight });
  }
  function drawWindow(at, block, displayAt) {
    const size = art.dimensions("window", { width: SIZES.windowWidth });
    const visual = ANOMALY_VISUALS[block.anomaly?.id];
    const key = visual?.target === "window" && block.anomaly.at === at ? visual.asset : "window";
    if (key !== "window" && visual.mode === "overlay") {
      art.draw(ctx, "window", displayAt, SIZES.windowCenterY - size.height / 2, size);
    }
    art.draw(ctx, key, displayAt, SIZES.windowCenterY - size.height / 2, size);
  }
  function drawBoard(at, block) {
    const size = art.dimensions("board", { width: SIZES.boardWidth });
    const visual = ANOMALY_VISUALS[block.anomaly?.id];
    const key = visual?.target === "board" ? visual.asset : "board";
    // Cancel only the board image mirror; its center still uses the block transform.
    art.draw(ctx, key, LAYOUT.board, SIZES.boardCenterY - size.height / 2, size, block.direction < 0);
  }
  function drawDoor(at, hasPlate) {
    art.draw(ctx, "door", at, SIZES.doorBottom - SIZES.doorHeight, { height: SIZES.doorHeight });
    if (hasPlate) {
      const size = art.dimensions("plate", { width: SIZES.plateWidth });
      art.draw(ctx, "plate", at, SIZES.plateCenterY - size.height / 2, size);
    }
  }
  function drawNormalLamp(at) {
    const size = art.dimensions("light", { width: SIZES.lightWidth });
    art.draw(ctx, "light", at, SIZES.lightCenterY - size.height / 2, size);
  }
  let backgroundPattern = null;
  function drawBackground() {
    const image = art.images.background;
    if (!image.complete || !image.naturalWidth) return;
    if (!backgroundPattern) backgroundPattern = ctx.createPattern(image, "repeat");
    if (!backgroundPattern) return;
    const size = art.dimensions("background", { height: H });
    const scale = size.height / image.naturalHeight;
    // The caller already translates by -camera. Keep the pattern anchored to
    // cumulative world coordinates through rebases, at the same image scale.
    ctx.save();
    ctx.translate(-run.worldOffset, 0);
    ctx.scale(scale, scale);
    ctx.fillStyle = backgroundPattern;
    ctx.fillRect((camera + run.worldOffset) / scale, 0, W / scale, H / scale);
    ctx.restore();
  }
  function drawCorridorNPC(npc, index, visual) {
    const at = npc.action === "board" ? LAYOUT.boy : npc.at;
    const height = npc.female ? SIZES.girlHeight : SIZES.boyHeight;
    const normalKey = npc.female ? (index === 0 ? "girlA" : "girlB") : "boy";
    const key = visual?.target === "npc" && visual[normalKey] ? visual[normalKey] : normalKey;
    art.draw(ctx, key, at, SIZES.npcFoot - height, { height });
  }
  function updateClassPlates() {
    ui["class-plates"].hidden = !assetsReady || run.phase === "end" || run.phase === "gameover";
    const ids = new Set(run.visibleBlocks.map(block => block.id));
    for (const [id, label] of plateLabels) {
      if (!ids.has(id)) { label.remove(); plateLabels.delete(id); }
    }
    for (const block of run.visibleBlocks) {
      let label = plateLabels.get(block.id);
      if (!label) {
        label = document.createElement("span"); label.className = "class-plate-label";
        ui["class-plates"].appendChild(label); plateLabels.set(block.id, label);
      }
      const x = blockX(block, CORRIDOR.doors[1]) - camera;
      label.textContent = `1-${block.room}`;
      label.style.left = `${x / W * 100}%`;
      label.style.top = `${SIZES.plateCenterY / H * 100}%`;
      label.hidden = x < -SIZES.plateWidth / 2 || x > W + SIZES.plateWidth / 2;
    }
  }
  function drawPerson(x, y, options = {}) {
    const { player = false, female = false, direction = 1, step = 0, scale = 1, back = false, front = false, faceColor = "#e9c39b" } = options;
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ellipse(0, 0, 18, 4, "#465c4c24");
    const stride = Math.sin(step) * 7;
    const navy = player ? "#344f68" : "#2f425e";
    line(-5, -23, -6 + stride, -3, female ? "#e0ba98" : "#737981", 8);
    line(5, -23, 6 - stride, -3, female ? "#e0ba98" : "#737981", 8);
    if (female) {
      line(-6 + stride, -13, -6 + stride, -3, "#354454", 6);
      line(6 - stride, -13, 6 - stride, -3, "#354454", 6);
    }
    rect(-10 + stride, -6, 12, 6, "#394941"); rect(1 - stride, -6, 12, 6, "#394941");
    rect(-12, -52, 24, 30, navy);
    polygon([[-7, -52], [0, -48], [7, -52], [5, -36], [-5, -36]], "#f1f1e7");
    polygon([[-11, -51], [-6, -52], [-2, -36], [-8, -41]], "#50637a");
    polygon([[11, -51], [6, -52], [2, -36], [8, -41]], "#50637a");
    if (female) {
      polygon([[-1, -46], [-7, -49], [-7, -42], [0, -44], [7, -42], [7, -49], [1, -46]], "#9d5967");
      polygon([[-11, -29], [11, -29], [17, -14], [-17, -14]], "#5c6979");
      for (let pleat = -10; pleat <= 10; pleat += 5) line(pleat, -27, pleat * 1.35, -15, "#adb5bd", 1);
      line(-13, -24, 13, -24, "#adb5bd"); line(-15, -18, 15, -18, "#adb5bd");
    } else polygon([[-2, -47], [2, -47], [3, -35], [0, -31], [-3, -35]], "#8e5961");
    ellipse(0, -30, 1, 1, "#c5b894");
    line(-13, -48, -15 - stride / 2, -31, navy, 6); line(13, -48, 15 + stride / 2, -31, navy, 6);
    ellipse(-15 - stride / 2, -28, 3, 4, "#e0b991"); ellipse(15 + stride / 2, -28, 3, 4, "#e0b991");
    if (player) { rect(direction > 0 ? -17 : 10, -50, 8, 26, "#a07551"); }
    ellipse(0, -64, 12, 14, faceColor);
    ellipse(-1, -72, 13, 9, player ? "#384642" : "#52614b");
    if (front) {
      rect(-13, -71, 4, 14, "#52614b"); rect(9, -71, 4, 14, "#52614b");
      if (female) { rect(-13, -65, 4, 15, "#52614b"); rect(9, -65, 4, 15, "#52614b"); }
    } else {
      rect(direction > 0 ? -13 : 7, -71, 6, 14, player ? "#384642" : "#52614b");
      if (female) rect(direction > 0 ? -13 : 7, -65, 6, 15, "#52614b");
    }
    if (back) {
      ellipse(0, -65, 12, 13, "#52614b");
      rect(-9, -55, 18, 3, "#e9c39b");
    } else if (front) {
      ellipse(-5, -64, 2, 2.5, "#182426"); ellipse(5, -64, 2, 2.5, "#182426");
      line(-3, -57, 3, -57, "#835a47");
    } else ellipse(direction * 6, -64, 1.4, 1.4, "#344b45");
    ctx.restore();
  }

  function drawFloorAnomaly(block, visual) {
    if (visual?.target !== "floor") return;
    const size = art.dimensions(visual.asset, visual.height ? { height: visual.height } : { width: visual.width });
    const top = visual.foot === undefined ? visual.centerY - size.height / 2 : visual.foot - size.height;
    art.draw(ctx, visual.asset, block.anomaly.at, top, size);
  }

  function drawCorridor() {
    rect(0, 0, W, H, "#d6d5cc");
    ctx.save(); ctx.translate(-camera, 0);
    drawBackground();
    // Ceiling fixtures use one cumulative-world lattice, independent of classes
    // and travel direction. Rebasing therefore never changes their rhythm.
    const spacing = LAYOUT.lightSpacing;
    const firstLight = Math.floor((camera + run.worldOffset - SIZES.lightWidth / 2) / spacing);
    const lastLight = Math.ceil((camera + run.worldOffset + W + SIZES.lightWidth / 2) / spacing);
    for (let index = firstLight; index <= lastLight; index++) {
      const worldX = index * spacing;
      const brokenBlock = run.visibleBlocks.find(block => block.anomaly?.target === "lamp"
        && worldX >= Math.min(block.anchor, blockX(block, WORLD.length)) + run.worldOffset
        && worldX < Math.max(block.anchor, blockX(block, WORLD.length)) + run.worldOffset);
      const x = worldX - run.worldOffset;
      if (brokenBlock) {
        const size = art.dimensions("light", { width: SIZES.lightWidth });
        art.draw(ctx, ANOMALY_VISUALS.light.asset, x, SIZES.lightCenterY - size.height / 2, size);
      } else drawNormalLamp(x);
    }
    for (const block of run.visibleBlocks) {
      const left = Math.min(block.anchor, blockX(block, WORLD.length));
      const right = Math.max(block.anchor, blockX(block, WORLD.length));
      if (right < camera || left > camera + W) continue;
      // Each template owns only its side of the empty boundary, including when
      // an immediate reversal replaces the previously drawn adjacent block.
      ctx.save(); ctx.beginPath(); ctx.rect(left, 0, WORLD.length, H); ctx.clip();
      // Render the template in entry-relative coordinates. Text glyphs and board
      // images counter-mirror to stay readable; all other sprites keep mirroring.
      ctx.save(); ctx.translate(block.anchor, 0); ctx.scale(block.direction, 1);
      textDirection = block.direction;
      for (const at of CORRIDOR.columns) drawPillar(at);
      CORRIDOR.doors.forEach((at, i) => drawDoor(at, i === 1));
      CORRIDOR.windows.forEach((at, index) => drawWindow(at, block, LAYOUT.windows[index]));
      for (const at of CORRIDOR.boards) drawBoard(at, block);
      const visual = ANOMALY_VISUALS[block.anomaly?.id];
      drawFloorAnomaly(block, visual);
      CORRIDOR.npcs.forEach((npc, index) => drawCorridorNPC(npc, index, visual));
      textDirection = 1;
      ctx.restore();
      ctx.restore();
    }
    // All seven aligned 1600x1600 images use this same fixed square.
    const playerSize = PLAYER_DRAW_SIZE;
    const playerFrame = playerMoving ? PLAYER_FRAMES[Math.floor((walk + 1e-9) / PLAYER_FRAME_SECONDS) % PLAYER_FRAMES.length] : "player";
    art.draw(ctx, playerFrame, run.x, SIZES.playerFoot - playerSize.height * SIZES.playerSoleAnchor,
      playerSize, facing === -1);
    ctx.restore();
  }

  function updateUI() {
    if (debug) {
      ui["debug-endings-status"].textContent = seenEndings.status();
      ui["debug-ending-preview"].disabled = run.phase !== "corridor" || !ui.overlay.hidden || endingPlayer.active;
      ui.debug.textContent = `内部進行：1年${run.currentRoom}組\n${run.anomaly ? "異変あり" : "異変なし"}\n選択：${run.anomaly?.code ?? "NORMAL"}\n種類：${run.anomaly?.label ?? "なし"}\n進行方向：${run.active.direction === -1 ? "左" : "右"}\nブロック：#${run.active.id} ／ ${run.inBlock ? "ブロック内" : "開始壁ゾーン"}\n判定済み：${run.active.judged ? "はい" : "いいえ"}\n直前の判断：${run.lastDecision ? (run.lastDecision.correct ? "正解" : "不正解") + " (#" + run.lastDecision.blockId + ")" : "未確定"}\nブロック内位置：${Math.round(run.localX)}\n状態：${run.phase}`;
      ui["debug-restart"].disabled = !ui.overlay.hidden || !run.inBlock || run.active.tutorial;
    }
  }
  function frame(timestamp) {
    const elapsed = lastTime === null ? 0 : Math.max((timestamp - lastTime) / 1000, 0);
    const dt = Math.min(elapsed, .05);
    lastTime = timestamp;
    if (!document.hidden && titleScreen.active && !endingPlayer.active) {
      titleScreen.refreshReady();
      if (titleScreen.leaving) {
        // Paint the starting wall under the short title fade without ticking Run.
        camera = cameraX(run, W); ctx.clearRect(0, 0, W, H); drawCorridor(); updateClassPlates();
      }
      titleScreen.tick(elapsed * 1000);
    } else if (!document.hidden && endingPlayer.active) {
      endingPlayer.tick(elapsed * 1000);
    } else if (!document.hidden) {
      if (ui.overlay.hidden) {
        run.tick(dt);
        const left = keys.has("ArrowLeft") || [...pointers.values()].includes(-1);
        const right = keys.has("ArrowRight") || [...pointers.values()].includes(1);
        const direction = Number(right) - Number(left);
        if (direction) {
          facing = direction;
          const before = run.travelX;
          run.move(direction, dt);
          const moved = run.travelX !== before;
          walk = moved ? (playerMoving ? (walk + elapsed) % (PLAYER_FRAME_SECONDS * PLAYER_FRAMES.length) : 0) : 0;
          playerMoving = moved;
        }
        else { walk = 0; playerMoving = false; }
      }
      audio.updateWalking(playerMoving ? Math.floor((walk + 1e-9) / PLAYER_FRAME_SECONDS) % PLAYER_FRAMES.length : null);
      camera = cameraX(run, W);
      ctx.clearRect(0, 0, W, H);
      drawCorridor();
      updateClassPlates();
      updateUI();
    }
    requestAnimationFrame(frame);
  }
  // Keep a sharp canvas on Retina displays while using fixed logical coordinates.
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  requestAnimationFrame(frame);
})();
