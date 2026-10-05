/* Executes the actual browser scripts with lightweight DOM/Canvas event doubles.
   No libraries, servers, network requests, or production test hooks. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const { WORLD, CORRIDOR, ANOMALIES } = require("../rules.js");
let checks = 0;
function test(name, body) { body(); checks++; console.log(`PASS ${name}`); }
function boot(random = () => .1, forced = null, saved = new Map(), endingFixture = null, configOverrides = {}, howToPlayFixture = null) {
  class Target {
    constructor() { this.listeners = {}; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    send(type, properties = {}) {
      const event = { repeat: false, stopPropagation() {}, preventDefault() { this.prevented = true; }, ...properties };
      for (const fn of this.listeners[type] ?? []) fn(event);
      return event;
    }
  }
  class Element extends Target {
    constructor(id) { super(); this.id = id; this.textContent = ""; this.innerHTML = ""; this.value = ""; this.style = {setProperty(name,value){this[name]=value;}}; this.children = []; this.hidden = ["debug", "debug-controls", "ending-screen", "ending-list", "ending-title"].includes(id); this.disabled = false; this.classes = new Set(); this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value) }; }
    replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); }
    appendChild(child) { child.parent = this; this.children.push(child); }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    focus() { doc.activeElement = this; }
    setPointerCapture() {}
    getContext() { return ctx; }
  }
  const doc = new Target(), win = new Target();
  doc.hidden = false; win.devicePixelRatio = 2;
  win.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const elements = Object.fromEntries([...fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/id="([^"]+)"/g)].map(match => [match[1], Object.assign(new Element(match[1]), { ownerDocument: doc })]));
  doc.createElement = () => { const element = new Element(""); element.ownerDocument = doc; return element; };
  doc.getElementById = id => { assert.ok(elements[id], `HTML includes ${id}`); return elements[id]; };
  const renderCalls = new Set();
  let drawing = [], transform = { x: 0, y: 0, sx: 1, sy: 1 };
  const stack = [];
  let shape = null;
  const ctx = new Proxy({}, { get(target, key) {
    if (key === "createPattern") return (image, repetition) => { renderCalls.add(key); return { image: path.basename(image.src), repetition }; };
    if (key === "createLinearGradient") return () => ({ addColorStop() {} });
    return target[key] ?? ((...args) => {
      renderCalls.add(key);
      if (key === "save") stack.push({ ...transform });
      if (key === "restore") transform = stack.pop();
      if (key === "translate") { transform.x += args[0] * transform.sx; transform.y += args[1] * transform.sy; }
      if (key === "scale") { transform.sx *= args[0]; transform.sy *= args[1]; }
      if (key === "beginPath") shape = null;
      if (key === "ellipse") shape = { ellipse: [transform.x + args[0] * transform.sx, transform.y + args[1] * transform.sy, args[2], args[3]] };
      if (key === "fillText") { renderCalls.add(args[0]); drawing.push({ text: args[0], color: target.fillStyle, x: transform.x + args[1] * transform.sx, y: transform.y + args[2] * transform.sy }); }
      if (key === "drawImage") {
        const [image] = args;
        const [sx, sy, sw, sh, x, y, width, height] = args.length === 5 ? [null,null,null,null,...args.slice(1)] : args.slice(1);
        drawing.push({ image: path.basename(image.src), source: args.length === 5 ? null : [sx, sy, sw, sh],
          x: transform.x + x * transform.sx, y: transform.y + y * transform.sy,
          width: width * transform.sx, height: height * transform.sy });
      }
      if (key === "fillRect") drawing.push({ color: target.fillStyle, x: transform.x + args[0] * transform.sx, y: transform.y + args[1] * transform.sy, width: args[2] * transform.sx, height: args[3] * transform.sy });
      if (key === "fill") drawing.push({ color: target.fillStyle, x: transform.x, y: transform.y, ...shape });
    });
  }});
  class AssetImage {
    set src(value) {
      this._src = value; const data = fs.readFileSync(path.join(root, value));
      this.naturalWidth = data.readUInt32BE(16); this.naturalHeight = data.readUInt32BE(20);
      this.complete = true; this.onload();
    }
    get src() { return this._src; }
  }
  const math = Object.create(Math); math.random = random;
  let nextFrame, timestamp = 0, run, assignments;
  const context = vm.createContext({ document: doc, window: win, Image: AssetImage, Math: math, console, requestAnimationFrame: fn => { nextFrame = fn; } });
  vm.runInContext(fs.readFileSync(path.join(root, "config.js"), "utf8"), context);
  context.GAME_CONFIG = { ...context.GAME_CONFIG, walkSpeed: 1, anomalyRate: .5, ...configOverrides };
  vm.runInContext(fs.readFileSync(path.join(root, "rules.js"), "utf8"), context);
  const OriginalRun = context.SchoolRules.Run;
  context.SchoolRules = { ...context.SchoolRules, Run: class extends OriginalRun { constructor() { super(random); run = this; } } };
  vm.runInContext(fs.readFileSync(path.join(root, "art.js"), "utf8"), context);
  for (const file of ["endingData.js", "howToPlayData.js", "endings.js", "shareData.js", "share.js", "title.js", "audio.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
    if(file === "howToPlayData.js" && howToPlayFixture) context.HOW_TO_PLAY_DATA = howToPlayFixture;
    if(file === "endingData.js" && endingFixture) context.SchoolEndingData = {...context.SchoolEndingData, ENDINGS:{...context.SchoolEndingData.ENDINGS,end1:{...context.SchoolEndingData.ENDINGS.end1,pages:endingFixture}}};
  }
  const OriginalAssignments = context.SchoolEndings.MemoryAssignments;
  context.SchoolEndings.MemoryAssignments = class extends OriginalAssignments { constructor() { super(); assignments = this; } };
  const audioCalls = [];
  const OriginalAudio = context.SchoolAudio.GameAudio;
  context.SchoolAudio.GameAudio = class extends OriginalAudio {
    constructor() { super(); for (const method of ["unlock", "playChime", "armChime", "startGameAmbience", "stopGameAmbience", "playDoorSound", "resetWalking", "updateWalking"]) { const original = this[method].bind(this); this[method] = (...args) => { audioCalls.push([method, ...args]); return original(...args); }; } }
  };
  vm.runInContext(fs.readFileSync(path.join(root, "game.js"), "utf8").replace("const FORCE_ANOMALY = null", `const FORCE_ANOMALY = ${JSON.stringify(forced)}`), context);
  function frames(count = 1, milliseconds = 20) { for (let i = 0; i < count; i++) { timestamp += milliseconds; drawing = []; nextFrame(timestamp); } }
  frames();
  const keydown = key => doc.send("keydown", { key, code: key.toLowerCase() === "d" ? "KeyD" : key });
  const keyup = key => doc.send("keyup", { key });
  const click = id => { assert.equal(elements[id].disabled, false); elements[id].send("click"); };
  function hold(key, count) { keydown(key); frames(count); keyup(key); }
  function start() { click("title-start"); frames(13); click("primary-button"); }
  function walkTo(target) {
    const direction = Math.sign(target - run.travelX), key = direction > 0 ? "ArrowRight" : "ArrowLeft";
    keydown(key);
    for (let count = 0; Math.abs(run.travelX - target) > .0001; count++) {
      assert.ok(count < 10000, "target is reachable");
      const before = run.travelX; frames(); assert.notEqual(run.travelX, before);
    }
    keyup(key);
  }
  const walkLocal = at => walkTo(run.travelX + run.active.direction * (at - run.localX));
  const exit = (forward = !run.anomaly) => walkLocal(forward ? WORLD.length + WORLD.playerRadius + 5 : -WORLD.playerRadius - 5);
  const advance = (goal = WORLD.finalRoom) => { walkLocal(1200); while (run.currentRoom < goal) exit(); };
  const plates = () => elements["class-plates"].hidden ? [] : elements["class-plates"].children
    .filter(label => !label.hidden).map(label => ({ text: label.textContent,
      x: parseFloat(label.style.left) * 960 / 100, y: parseFloat(label.style.top) * 440 / 100 }));
  return { assignments, audioCalls, walkLocal, exit, advance, walkTo, snapshot: () => [...drawing, ...plates()], run, elements, frames, keydown, keyup, hold, click, start, doc, win, renderCalls };
}
const { LAYOUT } = require(path.join(root, "art.js"));
const CLASS_IMAGES = new Set(["pillar.png", "door.png", "window.png", "bulletin_board.png", "class_plate.png", "girl_a.png", "girl_b.png", "boy.png"]);
const PLAYER_IMAGES = new Set(["player_idle.png", ...Array.from({length:6},(_,i)=>`player_walk_${String(i+1).padStart(2,"0")}.png`)]);
const NPC_IMAGES = new Set(["girl_a.png", "girl_b.png", "boy.png", "anomaly_girl_a_facing.png", "anomaly_girl_b_facing.png", "anomaly_boy_facing.png"]);
function center(i) { return Math.round((i.x + i.width / 2) * 1e8) / 1e8; }
function visible(i) { return Math.max(i.x, i.x + i.width) > 0 && Math.min(i.x, i.x + i.width) < 960; }
test("PC arrows, key release, Retina canvas and entry labels work", () => {
  const app = boot(); assert.equal(app.run.phase, "title"); assert.equal(app.elements.debug.hidden, true);
  assert.equal(app.elements.game.width, 1920); assert.equal(app.elements.game.height, 880);
  app.keydown("Enter"); app.keyup("Enter"); app.frames(13); app.click("primary-button"); app.hold("ArrowRight", 40);
  assert.equal(app.run.x, 440); app.frames(30); assert.equal(app.run.x, 440);
  assert.equal(app.renderCalls.has("下 駄 箱"), false);
  assert.ok(app.renderCalls.has("createPattern"));
  assert.ok(app.snapshot().some(i => i.color?.image === "bg_hallway.png" && i.color.repetition === "repeat"));
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal(html.includes("調べる"), false); assert.ok(html.includes("▲<span>入室</span>"));
});
test("touch hold, cancellation, simultaneous arrows and entry away from doors", () => {
  const app = boot(); app.start(); const right = app.elements["right-button"];
  right.send("pointerdown", { pointerId: 1 }); app.frames(30); assert.equal(app.run.x, 390);
  app.elements["left-button"].send("pointerdown", { pointerId: 2 }); app.frames(20); assert.equal(app.run.x, 390);
  app.elements["left-button"].send("pointercancel", { pointerId: 2 }); app.frames(10); assert.equal(app.run.x, 440);
  right.send("lostpointercapture", { pointerId: 1 }); app.frames(20); assert.equal(app.run.x, 440);
  app.click("up-button"); assert.equal(app.run.phase, "corridor");
});
test("held touch crosses boundary without interruption, modal, feedback or a player jump", () => {
  const app = boot(); app.start(); app.walkLocal(WORLD.length + WORLD.playerRadius);
  const old = app.run.active;
  const player = () => center(app.snapshot().find(i => PLAYER_IMAGES.has(i.image)));
  assert.equal(player(), 480);
  const right = app.elements["right-button"]; right.send("pointerdown", { pointerId: 1 });
  app.frames(); assert.equal(app.run.currentRoom, 2); assert.equal(app.run.trailing, old);
  assert.equal(player(), 480); assert.equal(app.elements.overlay.hidden, true);
  assert.ok(right.classes.has("pressed")); app.frames(20); assert.equal(app.run.localX, 130);
  right.send("pointerup", { pointerId: 1 }); app.frames(20); assert.equal(app.run.localX, 130);
});
for (const id of ["hole", "light", "dog"]) {
  test(`${id}: render and repeated reversals preserve the anomaly; return creates a leftward block`, () => {
    const bucket = (ANOMALIES.findIndex(item => item.id === id) + .5) / ANOMALIES.length;
    let samples = 0; const app = boot(() => ++samples % 2 ? .9 : bucket); app.start();
    app.walkLocal(2000); assert.equal(samples, 0); app.exit(true);
    const block = app.run.active; assert.equal(block.anomaly.id, id);
    for (let i = 0; i < 3; i++) { app.walkLocal(block.anomaly.at); app.walkLocal(700); }
    assert.equal(app.run.active, block); assert.equal(samples, 2);
    app.walkLocal(block.anomaly.at); const expectedImage = { hole: "anomaly_floor_hole.png", light: "anomaly_light_broken.png", dog: "anomaly_dog.png" }[id];
    assert.ok(app.snapshot().some(i => i.image === expectedImage));
    app.exit(false); assert.equal(app.run.currentRoom, 3); assert.equal(app.run.active.direction, -1);
    app.walkLocal(CORRIDOR.doors[1]);
    assert.ok(app.snapshot().some(i => i.text === "1-3" && i.x > 0 && i.x < 960));
    assert.equal(app.snapshot().some(i => i.text === "下 駄 箱"), false); assert.equal(app.elements.overlay.hidden, true);
  });
}
test("wrong judgement silently generates class 1 without restoring lockers", () => {
  const app = boot(); app.start(); app.advance(4); app.exit(false);
  assert.equal(app.run.currentRoom, 1); app.walkLocal(CORRIDOR.doors[1]);
  assert.ok(app.snapshot().some(i => i.text === "1-1" && i.x >= 0 && i.x <= 960));
  assert.equal(app.elements.overlay.hidden, true); assert.equal(app.snapshot().some(i => i.text === "下 駄 箱"), false);
});
test("all normal blocks render identical image furniture and stationary female/male NPCs", () => {
  const app = boot(); app.start();
  const geometry = () => app.snapshot().filter(i => CLASS_IMAGES.has(i.image) && visible(i));
  app.walkLocal(CORRIDOR.windows[1]); const baseline = geometry();
  assert.equal(baseline.filter(i => i.image === "girl_a.png" || i.image === "girl_b.png").length, 2);
  app.frames(150); assert.deepEqual(geometry(), baseline);
  for (let room = 2; room <= WORLD.finalRoom; room++) { app.exit(true); app.walkLocal(CORRIDOR.windows[1]); assert.deepEqual(geometry(), baseline, `room ${room}`); }
});
test("left/right traversal renders three windows and only the rear door plate in the correct order", () => {
  let count = 0; const app = boot(() => ++count <= 2 ? .9 : .1); app.start(); app.exit(true); app.exit(false);
  assert.equal(app.run.active.direction, -1);
  for (const at of [CORRIDOR.doors[0], ...CORRIDOR.windows, CORRIDOR.doors[1], CORRIDOR.boards[0]]) {
    app.walkLocal(at);
    if (at === CORRIDOR.doors[1]) assert.ok(app.snapshot().some(i => i.text === "1-3"));
    if (at === CORRIDOR.doors[0]) assert.equal(app.snapshot().some(i => i.text === "1-3" && i.x >= 0 && i.x <= 960), false);
    if (CORRIDOR.windows.includes(at)) assert.ok(app.snapshot().some(i => i.image === "window.png" && center(i) > 350 && center(i) < 610));
    if (at === CORRIDOR.boards[0]) assert.ok(app.snapshot().some(i => i.image === "bulletin_board.png" && center(i) > 300 && center(i) < 650));
  }
});
test("ceiling lights retain a 400px world rhythm through judgement, rebase and reversal", () => {
  const app = boot(); app.start(); app.walkLocal(WORLD.length + WORLD.playerRadius);
  const lamps = () => app.snapshot().filter(i => (i.image === "light.png" || i.image === "anomaly_light_broken.png")).map(center).sort((a,b) => a-b);
  const before = lamps();
  for (let i = 1; i < before.length; i++) assert.equal(before[i] - before[i - 1], 400);
  app.hold("ArrowRight", 1); assert.equal(app.run.currentRoom, 2);
  const after = lamps();
  for (const at of after.filter(at => at > 10 && at < 950)) assert.ok(before.some(old => Math.abs(old - 5 - at) < 1e-7));
  app.hold("ArrowLeft", 1);
  for (const at of lamps().filter(at => at > 10 && at < 950)) assert.ok(after.some(old => Math.abs(old + 5 - at) < 1e-7));
});
test("both boundary exits keep the player centered and input/overlays uninterrupted", () => {
  let samples = 0; const app = boot(() => ++samples % 2 ? .9 : .9); app.start(); app.exit(true);
  for (const forward of [false, true, false]) {
    app.walkLocal(forward ? WORLD.length + WORLD.playerRadius : -WORLD.playerRadius);
    const before = app.run.travelX, direction = app.run.active.direction * (forward ? 1 : -1);
    app.hold(direction > 0 ? "ArrowRight" : "ArrowLeft", 1);
    assert.equal(app.run.travelX, before + direction * 5);
    const player = app.snapshot().find(i => PLAYER_IMAGES.has(i.image));
    assert.equal(center(player), 480); assert.equal(app.elements.overlay.hidden, true);
    assert.equal(app.snapshot().some(i => i.text === "下 駄 箱"), false);
  }
});
test("PC and touch both enter class 8 and clear; either route reaches the goal", () => {
  for (const touch of [false, true]) {
    let samples = 0; const app = boot(touch ? () => ++samples % 2 ? .9 : .9 : () => .1);
    app.start(); app.advance();
    if (touch) { app.keydown("d"); app.frames(); debugSelect(app, "NORMAL"); }
    app.walkLocal(CORRIDOR.doors[1]);
    if (touch) app.click("up-button"); else app.keydown("ArrowUp");
    app.frames(30); assert.equal(app.run.phase, "end");
    assert.equal(app.elements["ending-screen"].hidden, false);
    assert.equal(app.elements["game-shell"].hidden, true);
    const {ENDINGS}=require("../endingData.js");
    for(let page=0;page<ENDINGS.end8Normal.pages.length;page++){
      while(app.elements["ending-text"].textContent!==ENDINGS.end8Normal.pages[page])app.click("ending-screen");
      if(page+1<ENDINGS.end8Normal.pages.length)app.click("ending-screen");
    }
    app.frames(40); assert.equal(app.elements["ending-finish"].hidden,true);
    if(touch)app.click("ending-screen");else app.keydown("Enter");
    app.frames(120); assert.equal(app.elements["ending-finish"].hidden, false);
    app.click("ending-return"); assert.equal(app.run.phase, "title"); assert.equal(app.elements["title-screen"].hidden, false);
    assert.equal(app.run.x, WORLD.start); assert.equal(app.run.entranceClosed, false);
  }
});
test("class 1 entry displays its memory instead of the old game over", () => {
  const app = boot(); app.start(); app.walkLocal(CORRIDOR.doors[0]); app.click("up-button");
  assert.equal(app.run.phase, "gameover"); app.frames(40);
  assert.equal(app.elements["ending-screen"].hidden, false);
  assert.equal(app.elements["ending-text"].textContent, require("../endingData.js").ENDINGS.end1.pages[0].split("\n")[0]);
  assert.equal(app.elements["overlay-body"].innerHTML.includes("GAME OVER"), false);
});
test("help, blur and visibility changes clear held inputs; debug exposes all required state only on D", () => {
  const app = boot(); app.start(); app.keydown("ArrowRight"); app.frames(20); const x = app.run.x;
  app.click("help-button"); app.frames(50); assert.equal(app.run.x, x);
  app.keydown("Escape"); app.frames(20); assert.equal(app.run.x, x);
  app.keydown("ArrowRight"); app.win.send("blur"); app.frames(20); assert.equal(app.run.x, x);
  app.keydown("ArrowRight"); app.doc.hidden = true; app.doc.send("visibilitychange"); app.frames(20);
  app.doc.hidden = false; app.doc.send("visibilitychange"); app.frames(20); assert.equal(app.run.x, x);
  app.walkLocal(1200); app.exit(true); assert.equal(app.elements.debug.hidden, true);
  app.keydown("d"); app.frames(); assert.equal(app.elements.debug.hidden, false);
  for (const value of ["1年2組", "異変なし", "種類：なし", "進行方向：右", "ブロック内", "直前の判断：正解", "判定済み：いいえ"]) assert.ok(app.elements.debug.textContent.includes(value), value);
  app.exit(false); app.frames(); assert.ok(app.elements.debug.textContent.includes("不正解"));
  app.keydown("d"); app.frames(); assert.equal(app.elements.debug.hidden, true);
});
test("normal play has no judgement feedback or progress HUD; landscape touch layout remains available", () => {
  const app = boot(); app.start(); app.advance();
  assert.equal(app.elements.progress, undefined); assert.equal(app.elements.status, undefined);
  assert.equal(app.elements.overlay.hidden, true);
  for (const label of app.renderCalls) assert.equal(/正解|不正解|戻ります|組へ進みます|現在.*組/.test(label), false, label);
  const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
  assert.ok(css.includes("(orientation: landscape)")); assert.ok(css.includes("touch-action: none"));
});
test("mirrored normal blocks preserve exact furniture/NPC geometry and readable text", () => {
  const right = boot(); right.start(); right.walkLocal(CORRIDOR.windows[1]);
  let samples = 0; const left = boot(() => ++samples <= 2 ? .9 : .1); left.start(); left.exit(true); left.exit(false); left.walkLocal(CORRIDOR.windows[1]);
  const geometry = (app, direction) => app.snapshot()
    .filter(i => CLASS_IMAGES.has(i.image))
    .map(i => ({ image: i.image, x: Math.round((direction === 1 ? i.x : 960 - i.x) * 1e8) / 1e8,
      y: i.y, width: Math.round(i.width * direction * 1e8) / 1e8, height: i.height }))
    .filter(i => i.x + i.width > 0 && i.x < 960)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(geometry(left, -1), geometry(right, 1));
  left.walkLocal(CORRIDOR.boards[0]); const baseline = left.snapshot().filter(i => NPC_IMAGES.has(i.image));
  assert.ok(baseline.length); left.frames(100); assert.deepEqual(left.snapshot().filter(i => NPC_IMAGES.has(i.image)), baseline);
  assert.ok(left.snapshot().some(i => i.image === "bulletin_board.png" && visible(i)));
});
for (const direction of [1, -1]) {
  test(`direction ${direction}: actual walk encounters the seven classroom fixtures in order, separated by a wall zone`, () => {
    let samples = 0; const app = boot(() => ++samples <= 2 ? .9 : .1); app.start();
    if (direction === -1) { app.exit(true); app.exit(false); }
    assert.equal(app.run.active.direction, direction);
    const block = app.run.active, encountered = [], seen = new Set();
    const fixtureImages = new Set(["pillar.png", "door.png", "window.png", "bulletin_board.png"]);
    for (let at = 0; at <= WORLD.length; at += 5) {
      app.walkLocal(at); assert.equal(app.run.active, block);
      const fixtures = app.snapshot().filter(i => fixtureImages.has(i.image));
      if (at >= CORRIDOR.doors[0] - 400 && at <= CORRIDOR.columns[0] + 200) {
        assert.ok(fixtures.some(i => Math.max(i.x, i.x + i.width) > 0 && Math.min(i.x, i.x + i.width) < 960), `classroom fixture at ${at}`);
      }
      for (const i of fixtures) {
        const center = i.x + i.width / 2;
        const fixtureAt = Math.round(at + direction * (center - 480));
        const key = `${i.image}:${fixtureAt}`;
        if (Math.abs(center - 480) <= 2.5 && fixtureAt >= CORRIDOR.zones.classroom.start && fixtureAt <= CORRIDOR.zones.classroom.end && !seen.has(key)) {
          seen.add(key); encountered.push(i.image);
        }
      }
    }
    assert.deepEqual(encountered, ["door.png", "window.png", "window.png", "window.png", "door.png", "bulletin_board.png", "pillar.png"]);
  });
  test(`direction ${direction}: wall architecture stays fixed when the judgement installs a fresh classroom`, () => {
    let samples = 0; const app = boot(() => ++samples <= 2 ? .9 : .1); app.start();
    if (direction === -1) { app.exit(true); app.exit(false); }
    app.run.random = () => { samples++; return .1; };
    const draws = samples;
    app.walkLocal(WORLD.length + WORLD.playerRadius);
    const before = app.run.active;
    assert.equal(samples, draws); assert.equal(before.judged, false);
    const wallColumns = () => app.snapshot().filter(i => i.image === "pillar.png" && center(i) >= 0 && center(i) <= 960);
    const old = wallColumns(); assert.equal(old.length, 0);
    app.hold(direction > 0 ? "ArrowRight" : "ArrowLeft", 1);
    assert.equal(app.run.currentRoom, before.room + 1); assert.equal(before.judged, true);
    const current = wallColumns(); assert.equal(current.length, old.length);
    current.forEach((i, index) => assert.ok(Math.abs(i.x - (old[index].x - direction * 5)) < 1e-7));
    assert.equal(app.elements.overlay.hidden, true); assert.equal(samples, draws + 1);
  });
}
for (const direction of [1, -1]) {
  test(`direction ${direction}: classroom → wall → judgement → immediate reversal keeps all classroom equipment offscreen`, () => {
    let samples = 0; const app = boot(() => ++samples <= 2 ? .9 : .1); app.start();
    if (direction === -1) { app.exit(true); app.exit(false); }
    app.run.random = () => .1;
    const boundary = app.run.travelX + direction * (WORLD.length - app.run.localX);
    const fixtures = new Set(["door.png", "window.png", "bulletin_board.png", ...NPC_IMAGES]);
    const check = () => {
      const boundaryScreen = 480 + boundary - app.run.travelX;
      const visible = app.snapshot().filter(i => fixtures.has(i.image)
        && Math.max(i.x, i.x + i.width) > 0 && Math.min(i.x, i.x + i.width) < 960);
      assert.equal(visible.length, 0, "classroom equipment and NPCs remain offscreen while turning at judgement");
      assert.equal(app.snapshot().filter(i => i.image === "pillar.png" && center(i) >= 0 && center(i) <= 960).length, 0);
      assert.equal(app.elements.overlay.hidden, true);
      assert.equal(center(app.snapshot().find(i => PLAYER_IMAGES.has(i.image))), 480);
    };
    const before = app.run.active;
    // Observe the complete classroom, then enter the independent wall zone.
    app.walkLocal(CORRIDOR.boards[0]); assert.equal(before.judged, false);
    app.walkLocal(Math.ceil((CORRIDOR.zones.classroom.end + 40) / 5) * 5);
    assert.equal(app.run.active, before); assert.equal(app.run.lastDecision?.blockId === before.id, false);
    app.walkTo(boundary - direction * 60);
    for (let offset = -60; offset <= 30; offset += 5) { app.walkTo(boundary + direction * offset); check(); }
    assert.equal(before.judged, true); assert.equal(app.run.currentRoom, before.room + 1);
    const newlyEntered = app.run.active;
    // Turn immediately and fully cross the same boundary back. A new block,
    // rather than past history, is expected by the unchanged game rule.
    for (let offset = 25; offset >= -30; offset -= 5) { app.walkTo(boundary + direction * offset); check(); }
    assert.equal(newlyEntered.judged, true); assert.notEqual(app.run.active, before);
    for (let lap = 0; lap < 4; lap++) {
      const sign = lap % 2 ? -1 : 1;
      const start = app.run.travelX;
      const end = boundary + direction * sign * 60;
      for (let x = start; Math.abs(x - end) > .001;) {
        x += Math.sign(end - x) * 5; app.walkTo(x); check();
      }
      assert.ok(app.run.visibleBlocks.length <= 2);
    }
  });
}
test("code-level forcing preserves the NORMAL tutorial but also applies in the final class, then applies one requested image anomaly", () => {
  const app = boot(() => .1, "dog"); app.start(); assert.equal(app.run.anomaly, null);
  app.exit(true); assert.equal(app.run.anomaly.id, "dog");
  while (app.run.currentRoom < WORLD.finalRoom) { assert.equal(app.run.anomaly.id, "dog"); app.exit(false); }
  assert.equal(app.run.anomaly.id, "dog"); app.walkLocal(CORRIDOR.doors[1]); app.click("up-button");
  assert.equal(app.run.phase, "corridor"); app.keydown("d"); app.frames(); debugSelect(app, "NORMAL");
  app.walkLocal(CORRIDOR.doors[1] - 100); app.walkLocal(CORRIDOR.doors[1]); app.click("up-button");
  assert.equal(app.run.phase, "end");
});
const anomalyImages = {
  hole: ["anomaly_floor_hole.png"], dog: ["anomaly_dog.png"], light: ["anomaly_light_broken.png"],
  girlsLooking: ["anomaly_girl_a_facing.png", "anomaly_girl_b_facing.png"],
  boyLooking: ["anomaly_boy_facing.png"], blood: ["anomaly_floor_stain.png"],
  handprint: ["anomaly_window_bloodhand.png"], deathNotice: ["anomaly_bulletin_death.png"],
  knife: ["anomaly_knife.png"], brokenWindow: ["anomaly_window_broken.png"]
};
const normalFixture = { "anomaly_window_broken.png": "window.png", "anomaly_window_bloodhand.png": "window.png", "anomaly_bulletin_death.png": "bulletin_board.png" };
function debugSelect(app, id, restart = true) {
  app.elements["debug-anomaly"].value = id;
  app.elements["debug-anomaly"].send("change");
  if (restart) app.click("debug-restart");
  app.frames();
}
for (const direction of [1, -1]) {
  for (const item of [null, ...ANOMALIES]) {
    test(`debug ${item?.code ?? "NORMAL"}, direction ${direction}: one static effect, unchanged layout, stationary NPCs and correct exit`, () => {
      const app = boot(); app.start(); app.exit(true); app.keydown("d"); app.frames();
      if (direction === -1) { debugSelect(app, "hole"); app.exit(false); }
      const target = item?.target === "lamp" ? (Math.round((app.run.active.anchor + app.run.worldOffset + direction * item.at) / LAYOUT.lightSpacing) * LAYOUT.lightSpacing - app.run.active.anchor - app.run.worldOffset) * direction : item?.at ?? CORRIDOR.windows[1];
      debugSelect(app, "NORMAL"); app.walkLocal(target); app.frames();
      const fixtureImages = new Set(["pillar.png", "door.png", "window.png", "bulletin_board.png", "class_plate.png"]);
      const fixtures = () => app.snapshot().filter(i => i.image !== "anomaly_window_broken.png" && (fixtureImages.has(i.image) || normalFixture[i.image]))
        .map(({ source, ...i }) => ({ ...i, image: normalFixture[i.image] || i.image }));
      const baseline = fixtures();
      for(const fixture of baseline) {
        if(fixture.image === "bulletin_board.png") {
          assert.ok(fixture.width > 0, "normal board letters never mirror");
          assert.equal(center(fixture), 480 + direction * (LAYOUT.board - target), "board center still mirrors with the block");
        } else assert.ok(fixture.width * direction > 0, "other fixtures keep the block mirror");
      }
      const old = app.run.active, priorDecision = app.run.lastDecision, room = app.run.currentRoom;
      debugSelect(app, item?.id ?? "NORMAL");
      assert.notEqual(app.run.active.id, old.id); assert.equal(app.run.lastDecision, priorDecision);
      assert.equal(app.run.currentRoom, room); assert.equal(app.run.active.direction, direction);
      assert.equal(app.run.anomaly?.id ?? null, item?.id ?? null);
      assert.deepEqual(fixtures(), baseline, "structure and all three NPC body positions stay unchanged");
      if(item?.id === "brokenWindow") {
        const drawing=app.snapshot(), overlay=drawing.find(i=>i.image === "anomaly_window_broken.png");
        const underneath=drawing.find(i=>i.image === "window.png" && i.x === overlay.x);
        assert.ok(underneath, "broken glass keeps the normal window underneath");
        assert.deepEqual([overlay.x,overlay.y,overlay.width,overlay.height],[underneath.x,underneath.y,underneath.width,underneath.height]);
        assert.ok(drawing.indexOf(underneath)<drawing.indexOf(overlay), "glass overlay is drawn after the normal window");
        assert.equal(drawing.filter(i=>i.image === "window.png").length,3);
      }
      const board = app.snapshot().find(i => ["bulletin_board.png", "anomaly_bulletin_death.png"].includes(i.image));
      assert.ok(board.width > 0, "NORMAL and death board images always face normally");
      assert.equal(center(board),480 + direction * (LAYOUT.board - target));
      for (const [image, count] of [["door.png", 2], ["window.png", 3], ["bulletin_board.png", 1], ["class_plate.png", 1]]) {
        assert.equal(fixtures().filter(i => i.image === image).length, count);
      }
      const actors = app.snapshot().filter(i => NPC_IMAGES.has(i.image));
      assert.equal(actors.length, 3);
      assert.deepEqual(actors.map(center).sort((a,b) => a-b), CORRIDOR.npcs
        .map(npc => 480 + direction * ((npc.action === "board" ? LAYOUT.boy : npc.at) - target)).sort((a,b) => a-b));
      const lampCenters = app.snapshot().filter(i => (i.image === "light.png" || i.image === "anomaly_light_broken.png")).map(center).sort((a,b) => a-b);
      assert.ok(lampCenters.length >= 2);
      for (let i = 1; i < lampCenters.length; i++) assert.ok([400, 800].includes(Math.round(lampCenters[i] - lampCenters[i - 1])));
      assert.ok(app.elements.debug.textContent.includes(item?.code ?? "NORMAL"));
      const selected = [...new Set(app.snapshot().filter(i => i.image?.startsWith("anomaly_")).map(i => i.image))].sort();
      assert.deepEqual(selected, item ? [...anomalyImages[item.id]].sort() : [], "exactly one anomaly type is drawn");
      if (item?.id === "light") {
        assert.equal(app.snapshot().filter(i => i.image === "light.png" && visible(i)).length, 0, "all lamps in this block are broken");
      }
      for (const actor of actors) {
        const height = actor.image.includes("boy") ? 200.2 : 181.5;
        assert.equal(actor.height, height); assert.equal(actor.y + actor.height, 337);
      }
      if (item?.target === "floor") {
        const floor = app.snapshot().find(i => anomalyImages[item.id].includes(i.image));
        const player = app.snapshot().find(i => PLAYER_IMAGES.has(i.image));
        const contact = item.id === "dog" ? floor.y + floor.height : floor.y + floor.height / 2;
        assert.ok(Math.abs(contact - (player.y + player.height * (1470/1600) - (item.id === "dog" ? 10 : 0))) < 1e-9, "floor anomaly intersects the player's walking lane");
      }
      const stableDrawing = () => {
        const drawing = app.snapshot();
        // The protagonist can face a different way after walking back. Compare
        // the scene up to the player image, including all static NPCs.
        const playerStart = drawing.findLastIndex(i => PLAYER_IMAGES.has(i.image));
        assert.ok(playerStart > 0);
        return drawing.slice(0, playerStart).filter(i => typeof i.color !== "object");
      };
      const snapshot = stableDrawing(); app.frames(100);
      assert.deepEqual(stableDrawing(), snapshot, "static effect has no time-based movement");
      const block = app.run.active;
      app.walkLocal(target - 100); app.walkLocal(target + 100); app.walkLocal(target); app.frames();
      assert.equal(app.run.active, block); assert.deepEqual(stableDrawing(), snapshot);
      // Changing the future selection never changes the round being inspected.
      debugSelect(app, "NORMAL", false); assert.equal(app.run.active, block);
      assert.equal(app.run.anomaly?.id ?? null, item?.id ?? null);
      app.exit(!item); assert.equal(app.run.lastDecision.correct, true);
      assert.equal(app.run.currentRoom, room + 1);
    });
  }
}
test("debug controls are hidden normally; closing debug cancels forcing and select arrows never move the player", () => {
  const app = boot(); app.start();
  assert.equal(app.elements["debug-controls"].hidden, true);
  app.keydown("d"); app.frames(); assert.equal(app.elements["debug-restart"].disabled, true);
  debugSelect(app, "dog", false); app.exit(true); assert.equal(app.run.anomaly.id, "dog");
  const before = app.run.x;
  app.doc.send("keydown", { key: "ArrowRight", target: app.elements["debug-anomaly"] }); app.frames(10);
  assert.equal(app.run.x, before);
  app.keydown("d"); app.frames(); assert.equal(app.run.debugAnomaly, null);
  assert.equal(app.elements["debug-controls"].hidden, true); assert.equal(app.run.anomaly.id, "dog");
  app.exit(false); assert.equal(app.run.anomaly, null);
});
test("six walking frames use 120ms, the same full-image rectangle and fixed foot anchor", () => {
  const app=boot();app.start();const sprite=()=>app.snapshot().find(i=>PLAYER_IMAGES.has(i.image));
  const idle=sprite(),start=app.run.travelX;
  assert.equal(idle.image,"player_idle.png");assert.equal(idle.source,null);
  assert.equal(idle.width,278.64);
  for(const file of PLAYER_IMAGES){
    const png=fs.readFileSync(path.join(root,"assets/images",file));
    assert.equal(png.readUInt32BE(16),1600);assert.equal(png.readUInt32BE(20),1600);
  }
  assert.equal(idle.height,278.64);assert.equal(idle.y+idle.height*(1470/1600),386);
  app.keydown("ArrowRight");const images=[];
  for(let i=0;i<7;i++){
    app.frames(i?6:1);const image=sprite();images.push(image.image);
    assert.equal(image.source,null,"no frame-specific cropping");
    assert.deepEqual([Math.abs(image.width),image.height,image.y],[idle.width,idle.height,idle.y]);
  }
  assert.deepEqual(images,[...Array.from({length:6},(_,i)=>`player_walk_${String(i+1).padStart(2,"0")}.png`),"player_walk_01.png"]);
  assert.equal(app.run.travelX-start,185,"movement remains 250px/sec");
  app.keyup("ArrowRight");app.frames();assert.equal(sprite().image,"player_idle.png");
  app.keydown("ArrowLeft");app.frames();assert.equal(sprite().image,"player_walk_01.png");assert.ok(sprite().width<0);
  app.frames(6);assert.equal(sprite().image,"player_walk_02.png");
  app.keyup("ArrowLeft");app.keydown("ArrowRight");app.frames();assert.equal(sprite().image,"player_walk_02.png");assert.ok(sprite().width>0);
  app.win.send("blur");app.frames();assert.equal(sprite().image,"player_idle.png");
});
test("animation uses elapsed milliseconds independently of movement delta clamping", () => {
  const a=boot(),b=boot();a.start();b.start();a.keydown("ArrowRight");b.keydown("ArrowRight");
  a.frames();b.frames();a.frames(9,20);b.frames(1,180);
  const sprite=app=>app.snapshot().find(i=>PLAYER_IMAGES.has(i.image));
  assert.equal(sprite(a).image,"player_walk_02.png");assert.equal(sprite(b).image,sprite(a).image);
});
test("touch shares all six walking frames, reversal and idle on cancellation or simultaneous directions", () => {
  const app=boot();app.start();const right=app.elements["right-button"],left=app.elements["left-button"];
  const sprite=()=>app.snapshot().find(i=>PLAYER_IMAGES.has(i.image));
  right.send("pointerdown",{pointerId:1});app.frames();
  for(let i=1;i<=6;i++){
    const image=sprite();assert.equal(image.image,`player_walk_${String(i).padStart(2,"0")}.png`);assert.ok(image.width>0);
    assert.equal(image.height,278.64);assert.equal(image.y+image.height*(1470/1600),386);if(i<6)app.frames(6);
  }
  left.send("pointerdown",{pointerId:2});app.frames();assert.equal(sprite().image,"player_idle.png");
  right.send("pointerup",{pointerId:1});app.frames();assert.equal(sprite().image,"player_walk_01.png");assert.ok(sprite().width<0);
  left.send("pointercancel",{pointerId:2});app.frames();assert.equal(sprite().image,"player_idle.png");
});
for (const direction of [1,-1]) for (const touch of [false,true]) {
  test(`final rear-door plate, all image anomalies and ${touch ? "touch" : "PC"} entry, direction ${direction}`, () => {
    for (const item of [null,...ANOMALIES]) {
      const app = boot(); app.start(); app.exit(true); app.keydown("d"); app.frames();
      if (direction === -1) { debugSelect(app, "hole"); debugSelect(app,"NORMAL",false); app.exit(false); }
      app.advance(); debugSelect(app,item?.id ?? "NORMAL");
      assert.equal(app.run.active.direction, direction);
      app.walkLocal(CORRIDOR.doors[0]);
      assert.equal(app.snapshot().some(i => i.text === "1-8" && i.x >= 0 && i.x <= 960), false);
      app.walkLocal(CORRIDOR.doors[1]);
      const plate = app.snapshot().find(i => i.text === "1-8" && Math.abs(i.x-480)<1);
      assert.ok(plate); assert.equal(app.run.phase,"corridor");
      if (item) for (const image of anomalyImages[item.id]) assert.ok(app.snapshot().some(i=>i.image===image));
      if (touch) app.click("up-button"); else { app.keydown("ArrowUp"); app.keyup("ArrowUp"); }
      app.frames();
      if (item) {
        assert.equal(app.run.phase,"corridor"); assert.equal(app.run.enteredRoom,null);
        app.exit(true); assert.equal(app.run.currentRoom,1); assert.equal(app.run.lastDecision.correct,false);
      } else { assert.equal(app.run.phase,"end"); assert.equal(app.run.lastDecision.correct,true); }
    }
  });
}
for (let room = 1; room <= 7; room++) test(`class ${room}: PC/touch entry maps to memory, locks all controls and saves only on completion`, () => {
  const saved = new Map(); const app = boot(() => .1, null, saved); app.start(); app.advance(room); app.walkLocal(CORRIDOR.doors[1]);
  if (room % 2) app.keydown("ArrowUp"); else app.click("up-button");
  app.frames(30); const before = app.run.travelX;
  app.hold("ArrowRight", 30); app.keydown("d");
  app.elements["right-button"].send("pointerdown", { pointerId: 99 }); app.frames(30);
  assert.equal(app.run.travelX, before); assert.equal(app.elements.debug.hidden, true);
  assert.equal(app.elements["game-shell"].hidden, true); assert.equal(saved.size, 0);
  const { ENDINGS } = require("../endingData.js");
  for (let page = 0; page < ENDINGS.end1.pages.length; page++) {
    while (app.elements["ending-text"].textContent !== ENDINGS.end1.pages[page]) app.click("ending-screen");
    assert.equal(app.elements["ending-text"].textContent, ENDINGS.end1.pages[page]);
    if (page + 1 < ENDINGS.end1.pages.length) app.click("ending-screen");
  }
  assert.deepEqual(JSON.parse(saved.get("ichinen8_endings_seen")), ["1"]);
  app.frames(40); assert.equal(app.elements["ending-finish"].hidden, false);
  app.click("ending-title"); assert.equal(app.run.phase, "title");
  assert.equal(app.elements["ending-screen"].hidden, true); assert.equal(app.elements["game-shell"].hidden, true);
  assert.equal(app.elements["title-screen"].hidden, false); assert.equal(app.elements["title-memory"].textContent, "エンディング 1/9");
});
test("persisted complete memory selects the true END only after valid NORMAL class 8 entry", () => {
  const saved = new Map([["ichinen8_endings_seen", '["1","2","3","4","5","6","7"]']]);
  const app = boot(() => .1, null, saved); app.start(); app.advance(); app.walkLocal(CORRIDOR.doors[1]); app.click("up-button");
  app.frames(30);
  const { ENDINGS } = require("../endingData.js");
  for (let page = 0; page < 6; page++) {
    while (app.elements["ending-text"].textContent !== ENDINGS.end8True.pages[page]) app.click("ending-screen");
    app.click("ending-screen");
  }
  assert.equal(app.elements["ending-text"].textContent, ENDINGS.end8True.pages[6]);
  assert.equal(Number(app.elements["ending-shade"].style.opacity), 0);
  app.frames(125); assert.equal(Number(app.elements["ending-shade"].style.opacity), .55);
});
test("memory debug editing is hidden and inactive unless D is open", () => {
  const saved = new Map(); const app = boot(() => .1, null, saved);
  app.click("debug-endings-all"); assert.equal(saved.size, 0);
  app.start(); app.keydown("d"); app.click("debug-endings-all");
  assert.equal(JSON.parse(saved.get("ichinen8_endings_seen")).length, 7);
  assert.ok(app.elements["debug-endings-status"].textContent.includes("END7：既読"));
  app.click("debug-endings-clear"); assert.equal(saved.get("ichinen8_endings_seen"), "[]");
});
test("Enter/Return/numpad reveal exactly one line without repeats or automatic reveals", () => {
  const fixture = ["教室は静まり返っていた。", "倒れた机。\n割れた窓。\n床に広がる赤黒い跡。", "その中央に、一人の生徒が立っている。\n手には包丁。"];
  const app = boot(() => .1,null,new Map(),fixture); app.start(); app.walkLocal(CORRIDOR.doors[0]); app.click("up-button"); app.frames(30);
  const enter = properties => app.doc.send("keydown", { key: "Enter", code: "Enter", ...properties });
  assert.equal(app.elements["ending-text"].textContent, "教室は静まり返っていた。");
  const first = enter(); assert.equal(first.prevented, true);
  assert.equal(app.elements["ending-text"].textContent, "倒れた机。");
  enter({ repeat: true }); enter({ isComposing: true }); app.frames(500);
  assert.equal(app.elements["ending-text"].textContent, "倒れた机。");
  enter({ key: "Return" }); assert.equal(app.elements["ending-text"].textContent, "倒れた机。\n割れた窓。");
  app.frames(500); assert.equal(app.elements["ending-text"].textContent, "倒れた机。\n割れた窓。");
  enter({ code: "NumpadEnter" }); assert.equal(app.elements["ending-text"].textContent, "倒れた机。\n割れた窓。\n床に広がる赤黒い跡。");
  for (let page = 2; page < fixture.length; page++) {
    enter();
    while (app.elements["ending-text"].textContent !== fixture[page]) enter();
  }
  app.frames(40); assert.equal(app.elements["ending-finish"].hidden, false);
  app.click("ending-title"); assert.equal(app.run.phase, "title"); assert.equal(app.elements["ending-screen"].hidden, true);
});
test("full-screen title freezes Run, game input and debug until its short start fade ends", () => {
  let samples = 0; const app = boot(() => { samples++; return .1; });
  const block = app.run.active, elapsed = block.elapsed, x = app.run.x;
  assert.equal(app.elements["title-screen"].hidden, false);
  assert.equal(app.elements["game-shell"].hidden, true);
  assert.equal(app.elements["title-memory"].textContent, "エンディング 0/9");
  app.hold("ArrowRight", 500); app.keydown("ArrowUp"); app.keydown("d");
  app.elements["right-button"].send("pointerdown", {pointerId:7}); app.elements["up-button"].send("click");
  app.frames(50); assert.equal(app.run.phase, "title"); assert.equal(app.run.x,x);
  assert.equal(app.run.active,block); assert.equal(block.elapsed,elapsed); assert.equal(samples,0);
  assert.equal(app.elements.debug.hidden,true);
  app.click("title-start"); app.frames(12); assert.equal(app.run.phase,"title");
  app.frames(); assert.equal(app.run.phase,"title");app.click("primary-button");assert.equal(app.run.phase,"corridor");
  assert.equal(app.elements["title-screen"].hidden,true); assert.equal(app.elements["game-shell"].hidden,false);
  assert.equal(app.run.currentRoom,1); assert.equal(app.run.anomaly,null); assert.equal(app.run.x,WORLD.start);
  app.frames(30); assert.equal(app.run.x,WORLD.start,"title input does not leak into play");
});
test("title uses existing storage for 0/7, partial/7, 7/7 and reloads it on END return", () => {
  for (const ids of [[],["1","3","7"],["1","2","3","4","5","6","7"]]) {
    const saved = new Map([["ichinen8_endings_seen",JSON.stringify(ids)]]);
    const app = boot(() => .1,null,saved);
    assert.equal(app.elements["title-memory"].textContent,`エンディング ${ids.length}/9`);
  }
  const saved = new Map(), app = boot(() => .1,null,saved); app.start();
  app.walkLocal(CORRIDOR.doors[0]); app.click("up-button"); app.frames(30);
  const {ENDINGS}=require("../endingData.js");
  for(let page=0;page<ENDINGS.end1.pages.length;page++) {
    while(app.elements["ending-text"].textContent!==ENDINGS.end1.pages[page])app.click("ending-screen");
    if(page+1<ENDINGS.end1.pages.length)app.click("ending-screen");
  }
  app.frames(40);
  saved.set("ichinen8_endings_seen", '["1","2","3"]'); // current storage is read on each title open
  app.click("ending-title"); assert.equal(app.elements["title-memory"].textContent,"エンディング 3/9");
  assert.equal(app.run.phase,"title"); assert.equal(app.elements["game-shell"].hidden,true);
  app.keydown("Enter"); app.frames(13); assert.equal(app.run.phase,"title");app.click("primary-button");assert.equal(app.run.phase,"corridor");
  assert.equal(saved.get("ichinen8_endings_seen"),'["1","2","3"]');
});
test("final NORMAL block stops forward movement, generation and walking animation in either direction", () => {
  for(const direction of [1,-1]) {
    const app=boot(); app.start();
    if(direction===-1){app.exit(true);app.keydown("d");app.frames();debugSelect(app,"hole");debugSelect(app,"NORMAL",false);app.exit(false);app.keydown("d");}
    app.advance();
    const block=app.run.active,serial=app.run.serial;
    app.walkLocal(WORLD.length-WORLD.playerRadius);
    const key=direction===1?"ArrowRight":"ArrowLeft";
    app.keydown(key);app.frames(100);app.keyup(key);
    assert.equal(app.run.localX,WORLD.length-WORLD.playerRadius);assert.equal(app.run.active,block);assert.equal(app.run.serial,serial);
    assert.equal(app.snapshot().find(i=>PLAYER_IMAGES.has(i.image)).image,"player_idle.png");
    app.walkLocal(CORRIDOR.doors[1]);app.click("up-button");assert.equal(app.run.phase,"end");
  }
});
test("all nine END previews freeze and resume the same run and never save memories", () => {
  const saved=new Map(),app=boot(()=>.1,null,saved);app.start();
  app.click("debug-ending-preview");app.frames();assert.equal(app.elements["game-shell"].hidden,false); // guarded while debug is closed
  assert.equal(app.run.phase,"corridor");app.keydown("d");app.frames();
  const {ENDINGS}=require("../endingData.js");const block=app.run.active,x=app.run.travelX,serial=app.run.serial;
  for(const ending of Object.values(ENDINGS)){
    app.elements["debug-ending"].value=ending.id;app.click("debug-ending-preview");app.frames(30);
    assert.equal(app.elements["game-shell"].hidden,true);assert.equal(app.elements["ending-return"].textContent,"デバッグへ戻る");
    const elapsed=block.elapsed;app.hold("ArrowRight",20);assert.equal(block.elapsed,elapsed);
    for(let page=0;page<ending.pages.length;page++){
      while(app.elements["ending-text"].textContent!==ending.pages[page])app.click("ending-screen");
      if(page+1<ending.pages.length)app.click("ending-screen");
    }
    if(ending.type!=="memory"){app.click("ending-screen");app.frames(120);}else app.frames(40);
    assert.equal(app.elements["ending-finish"].hidden,false);app.click("ending-return");app.frames();
    assert.equal(app.run.phase,"corridor");assert.equal(app.run.active,block);assert.equal(app.run.travelX,x);assert.equal(app.run.serial,serial);
    assert.equal(app.elements.debug.hidden,false);assert.equal(app.elements["title-screen"].hidden,true);assert.equal(saved.size,0);
  }
  // Leaving preview mode must restore the actual ending's normal save/title behavior.
  app.walkLocal(CORRIDOR.doors[0]);app.click("up-button");app.frames(30);
  for(let page=0;page<ENDINGS.end1.pages.length;page++){
    while(app.elements["ending-text"].textContent!==ENDINGS.end1.pages[page])app.click("ending-screen");
    if(page+1<ENDINGS.end1.pages.length)app.click("ending-screen");
  }
  app.frames(40);app.click("ending-title");assert.equal(app.run.phase,"title");
  assert.deepEqual(JSON.parse(saved.get("ichinen8_endings_seen")),["1"]);
  assert.equal(app.elements["title-memory"].textContent,"エンディング 1/9");
});
test("audio unlock belongs to the start gesture; loops stop at END and resume only on play", () => {
  const app=boot();assert.equal(app.audioCalls.filter(c=>c[0]!=="armChime").length,0);
  app.click("title-start");assert.deepEqual(app.audioCalls.filter(c=>c[0]!=="armChime"),[["unlock"],["playChime"]]);
  app.frames(13);assert.equal(app.audioCalls.some(c=>c[0]==="startGameAmbience"),false);app.click("primary-button");assert.ok(app.audioCalls.some(c=>c[0]==="startGameAmbience"));
  app.click("up-button");assert.equal(app.audioCalls.filter(c=>c[0]==="playDoorSound").length,0);
  app.walkLocal(CORRIDOR.doors[0]);app.click("up-button");
  assert.equal(app.audioCalls.filter(c=>c[0]==="playDoorSound").length,1);
  assert.equal(app.audioCalls.filter(c=>c[0]!=="resetWalking").at(-2)[0],"stopGameAmbience");
  assert.equal(app.audioCalls.at(-1)[0],"playDoorSound");
});
test("PC and touch feed the exact displayed walking frame to audio without changing timing", () => {
  for(const touch of [false,true]) {
    const app=boot();app.start();app.audioCalls.length=0;
    if(touch)app.elements["right-button"].send("pointerdown",{pointerId:1});else app.keydown("ArrowRight");
    app.frames();assert.deepEqual(app.audioCalls.at(-1),["updateWalking",0]);
    for(let i=1;i<6;i++){app.frames(6);assert.deepEqual(app.audioCalls.at(-1),["updateWalking",i]);}
    if(touch)app.elements["right-button"].send("pointerup",{pointerId:1});else app.keyup("ArrowRight");
    app.frames();assert.deepEqual(app.audioCalls.filter(c=>c[0]==="updateWalking").at(-1),["updateWalking",null]);
  }
});
test("speed config scales shared walking/footstep timing without changing frame order or placement", () => {
  for(const multiplier of [.8,1.2,1.5]) {
    const app=boot(()=>.1,null,new Map(),null,{walkSpeed:multiplier});app.start();app.keydown("ArrowRight");app.frames();
    const sprite=()=>app.snapshot().find(i=>PLAYER_IMAGES.has(i.image)),idle=sprite();
    const start=app.run.travelX;app.frames(1,40);assert.ok(Math.abs((app.run.travelX-start)-10*multiplier)<1e-8);
    app.frames(1,120/multiplier-40);assert.equal(sprite().image,"player_walk_02.png");
    app.frames(1,240/multiplier);assert.equal(sprite().image,"player_walk_04.png");
    assert.deepEqual(app.audioCalls.filter(c=>c[0]==="updateWalking").at(-1),["updateWalking",3]);
    assert.deepEqual([sprite().height,sprite().width,sprite().y],[idle.height,idle.width,idle.y]);
    app.keyup("ArrowRight");app.frames();assert.equal(sprite().image,"player_idle.png");
  }
});
function finishCurrent(app, endingId, returnButton = "ending-return") {
  const {ENDINGS}=require("../endingData.js");app.frames(30);
  for(let page=0;page<ENDINGS[endingId].pages.length;page++) {
    while(app.elements["ending-text"].textContent!==ENDINGS[endingId].pages[page])app.click("ending-screen");
    if(page+1<ENDINGS[endingId].pages.length)app.click("ending-screen");
  }
  if(endingId.startsWith("end8")){app.click("ending-screen");app.frames(120);}else app.frames(40);
  app.click(returnButton);
}
test("3 → 6 → 3 → 2 assigns memories 1 → 2 → 1 → 3 and resumes the exact corridor", () => {
  const saved=new Map(),app=boot(()=>.1,null,saved);app.start();
  for(const [room,ending] of [[3,"end1"],[6,"end2"],[3,"end1"],[2,"end3"]]) {
    if(app.run.currentRoom>room)app.exit(false);
    app.advance(room);app.walkLocal(CORRIDOR.doors[1]);
    const block=app.run.active,x=app.run.travelX,serial=app.run.serial;
    app.click("up-button");app.frames(30);
    assert.equal(app.elements["ending-text"].textContent,require("../endingData.js").ENDINGS[ending].pages[0].split("\n")[0]);
    const elapsed=block.elapsed;app.frames(40);assert.equal(block.elapsed,elapsed);
    finishCurrent(app,ending);assert.equal(app.run.phase,"corridor");assert.equal(app.run.active,block);assert.equal(app.run.travelX,x);assert.equal(app.run.serial,serial);
  }
  assert.deepEqual({...app.assignments.classEndingAssignments},{3:0,6:1,2:2});assert.equal(app.assignments.nextEndingIndex,3);
  assert.deepEqual(JSON.parse(saved.get("ichinen8_endings_seen")),["1","2","3"]);
  // Explicit title exit then a new start resets only the per-play assignments.
  app.click("up-button");finishCurrent(app,"end3","ending-title");app.start();
  assert.deepEqual({...app.assignments.classEndingAssignments},{});assert.equal(app.assignments.nextEndingIndex,0);assert.equal(saved.get("ichinen8_endings_seen"),'["1","2","3"]');
});
test("title list masks locked names, blocks selection, reuses all nine ENDs and preserves gameplay/assignments/storage", () => {
  const saved=new Map([["ichinen8_endings_seen",'["1","2"]']]),app=boot(()=>.1,null,saved);
  app.click("title-ending-list");const list=app.elements["ending-list-items"].children;
  assert.equal(list.length,9);assert.equal(list[0].textContent,"01　記憶1");assert.equal(list[1].textContent,"02　記憶2");
  for(let i=2;i<9;i++){assert.equal(list[i].textContent,`${String(i+1).padStart(2,"0")}　？？？？？`);assert.equal(list[i].disabled,true);}
  list[8].send("click");assert.equal(app.elements["ending-screen"].hidden,true);
  app.keydown("Enter");app.frames(30);assert.equal(app.run.phase,"title");
  app.click("ending-list-back");
  saved.set("ichinen8_endings_seen",JSON.stringify(Array.from({length:9},(_,i)=>String(i+1))));
  app.click("title-ending-list");assert.equal(app.elements["title-memory"].textContent,"エンディング 9/9");
  const state=JSON.stringify(app.run),assignments=JSON.stringify(app.assignments),storage=saved.get("ichinen8_endings_seen");
  const ids=["end1","end2","end3","end4","end5","end6","end7","end8Normal","end8True"];
  for(let i=0;i<9;i++) {
    const buttons=app.elements["ending-list-items"].children;buttons[i].send("click");app.frames(30);
    assert.equal(app.elements["ending-text"].textContent,require("../endingData.js").ENDINGS[ids[i]].pages[0].split("\n")[0]);
    app.keydown("ArrowRight");app.elements["right-button"].send("pointerdown",{pointerId:11});app.frames(20);
    finishCurrent(app,ids[i]);assert.equal(app.elements["ending-list"].hidden,false);assert.equal(app.elements["game-shell"].hidden,true);
    assert.equal(JSON.stringify(app.run),state);assert.equal(JSON.stringify(app.assignments),assignments);assert.equal(saved.get("ichinen8_endings_seen"),storage);
    assert.equal(app.audioCalls.filter(c=>c[0]==="playDoorSound").length,0);
  }
  app.click("ending-list-back");assert.equal(app.elements["ending-list"].hidden,true);assert.equal(app.elements["title-screen"].hidden,false);
});
test("title counts 0, 1, 5 and 9 unlocked endings; old memory saves remain valid", () => {
  for(const count of [0,1,5,9]) {
    const saved=new Map([["ichinen8_endings_seen",JSON.stringify(Array.from({length:count},(_,i)=>String(i+1)))]]);
    const app=boot(()=>.1,null,saved);assert.equal(app.elements["title-memory"].textContent,`エンディング ${count}/9`);
  }
});
test("memory deletion requires confirmation, preserves unrelated saves, refreshes list and new-game assignment", () => {
  const saved=new Map([["ichinen8_endings_seen",'["1","2","3","4","5","6","7","8","9"]'],["volume","0.8"],["other-save","unchanged"]]);
  const app=boot(()=>.1,null,saved),before=JSON.stringify(app.run);
  app.click("ending-delete-yes");assert.equal(app.elements["title-memory"].textContent,"エンディング 9/9");
  app.click("title-ending-list");app.click("ending-list-delete");
  assert.equal(app.elements["ending-delete-confirm"].hidden,false);assert.equal(app.elements["ending-list-items"].hidden,true);
  app.click("ending-delete-cancel");assert.equal(app.elements["ending-delete-confirm"].hidden,true);assert.equal(JSON.parse(saved.get("ichinen8_endings_seen")).length,9);
  app.click("ending-list-delete");app.click("ending-delete-yes");
  assert.equal(saved.get("ichinen8_endings_seen"),"[]");assert.equal(saved.get("volume"),"0.8");assert.equal(saved.get("other-save"),"unchanged");
  assert.equal(app.elements["title-memory"].textContent,"エンディング 0/9");assert.equal(JSON.stringify(app.run),before);
  for(const button of app.elements["ending-list-items"].children){assert.equal(button.disabled,true);assert.ok(button.textContent.endsWith("？？？？？"));}
  app.click("ending-list-back");app.start();app.advance(3);app.walkLocal(CORRIDOR.doors[1]);app.click("up-button");
  assert.equal(app.assignments.classEndingAssignments[3],0);finishCurrent(app,"end1","ending-title");
  assert.equal(app.elements["title-memory"].textContent,"エンディング 1/9");
  assert.equal(boot(()=>.1,null,saved).elements["title-memory"].textContent,"エンディング 1/9");
});
test("each title start shows one help screen and freezes input until continue", () => {
  const app=boot();app.click("title-start");app.frames(13);
  assert.equal(app.elements.overlay.hidden,false);assert.equal(app.elements["overlay-title"].textContent,require("../howToPlayData.js").title);
  assert.equal(app.elements["primary-button"].textContent,"ゲーム開始");
  assert.equal(app.run.phase,"title");
  assert.deepEqual(app.elements["overlay-body"].children.map(p=>p.textContent),[...require("../howToPlayData.js").lines]);
  const state=JSON.stringify(app.run);app.keydown("ArrowRight");app.elements["right-button"].send("pointerdown",{pointerId:1});app.frames(40);
  assert.equal(JSON.stringify(app.run),state);assert.equal(app.run.anomaly,null);
  app.keydown("Enter");assert.equal(app.elements.overlay.hidden,true);app.keyup("ArrowRight");app.keydown("ArrowRight");app.frames(5);assert.ok(app.run.x>JSON.parse(state).x);app.keyup("ArrowRight");
  app.walkLocal(CORRIDOR.doors[0]);app.click("up-button");finishCurrent(app,"end1","ending-title");
  app.click("title-start");app.frames(13);assert.equal(app.elements.overlay.hidden,false);app.click("primary-button");assert.equal(app.elements.overlay.hidden,true);
});
test("help text data controls title, paragraphs and button; no initialization/audio restart before confirmation", () => {
  const data={title:"説明テスト",lines:["一行目","二行目"],buttonText:"進む",titleSize:36,bodySize:16,mobileTitleSize:24,mobileBodySize:14};
  const app=boot(()=>.1,null,new Map(),null,{},data),state=JSON.stringify(app.run);
  app.click("title-start");app.frames(13);assert.equal(JSON.stringify(app.run),state);
  assert.deepEqual(["--help-title-size","--help-body-size","--help-mobile-title-size","--help-mobile-body-size"].map(key=>app.elements.overlay.style[key]),["36px","16px","24px","14px"]);
  assert.equal(app.elements["overlay-title"].textContent,data.title);assert.equal(app.elements["primary-button"].textContent,data.buttonText);
  assert.deepEqual(app.elements["overlay-body"].children.map(p=>p.textContent),data.lines);
  app.keydown("Escape");assert.equal(app.elements.overlay.hidden,false);assert.equal(app.run.phase,"title");
  assert.equal(app.audioCalls.filter(c=>c[0]==="playChime").length,1);assert.equal(app.audioCalls.filter(c=>c[0]==="startGameAmbience").length,0);
  app.click("primary-button");assert.equal(app.run.phase,"corridor");assert.equal(app.audioCalls.filter(c=>c[0]==="playChime").length,1);
  assert.equal(app.audioCalls.filter(c=>c[0]==="startGameAmbience").length,1);
});
console.log(`\n${checks} runtime checks passed. Real browser layout requires visual inspection.`);
