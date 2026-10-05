/* Pure rules; classic script keeps local file:// play working. */
(function (root) {
  "use strict";
  const CONFIG = typeof module === "object" && module.exports ? require("./config.js") : root.GAME_CONFIG;
  const LAST_CLASS = 8;
  const ANOMALY_RATE = CONFIG.anomalyRate;
  const WORLD = Object.freeze({ finalRoom: LAST_CLASS, length: 3700, start: 240,
    entranceLength: 900, playerRadius: 25, entryRadius: 75, speed: CONFIG.baseWalkSpeed * CONFIG.walkSpeed, clearance: 25 });
  // Distances measured FROM THE ENTRY in the block's travel direction.
  // Classroom and wall are separate zones. The wall spans a judgement anchor;
  // the next classroom starts only after the rest of that SAME wall zone.
  // Layout data only: both rendered doors and entry proximity use these coordinates.
  const CORRIDOR = Object.freeze({
    zones: Object.freeze({
      classroom: Object.freeze({ start: 990, end: 3145 }),
      wall: Object.freeze({ start: 3145, decision: 3700, end: 4690,
        pillarOffsets: Object.freeze([]) })
    }),
    columns: Object.freeze([3100]),
    doors: Object.freeze([1090, 2230]),
    windows: Object.freeze([1350, 1660, 1970]),
    boards: Object.freeze([2670]),
    lamps: Object.freeze([1090, 1440, 1660, 1970, 2230, 2670, 3100]),
    npcs: Object.freeze([
      Object.freeze({ at: 1620, female: true, facing: 1, action: "talk" }),
      Object.freeze({ at: 1700, female: true, facing: -1, action: "talk" }),
      Object.freeze({ at: 2670, female: false, facing: 0, action: "board" })
    ]),
    sequence: Object.freeze(["frontDoor", "window", "windowWithGirls", "window",
      "rearDoor", "emptyWall", "boardWithBoy", "column"])
  });
  // IDs select rendering handlers; targets refer to the unchanged template.
  const ANOMALIES = Object.freeze([
    { id: "hole", label: "廊下の穴", target: "floor", at: 2040 },
    { id: "dog", label: "犬", target: "floor", at: 2790 },
    { id: "light", label: "割れた電灯", target: "lamp", at: CORRIDOR.lamps[2] },
    { id: "girlsLooking", label: "こちらを見る女子生徒", target: "npc", at: CORRIDOR.windows[1] },
    { id: "boyLooking", label: "こちらを見る男子生徒", target: "npc", at: CORRIDOR.boards[0] },
    { id: "blood", label: "廊下の血痕", target: "floor", at: 2040 },
    { id: "handprint", label: "窓の血の手形", target: "window", at: CORRIDOR.windows[0] },
    { id: "deathNotice", label: "掲示板の「死」", target: "board", at: CORRIDOR.boards[0] },
    { id: "knife", label: "血の付いた包丁", target: "floor", at: 2440 },
    { id: "brokenWindow", label: "割れた教室窓", target: "window", at: CORRIDOR.windows[2] }
  ].map((item, index) => Object.freeze({ ...item,
    code: `ANOMALY ${String(index + 1).padStart(2, "0")}`, type: "static" })));
  function selectAnomaly(random, rate, forced = null) {
    if (forced === "NORMAL") return null;
    if (forced !== null) return ANOMALIES.find(item => item.id === forced);
    if (rate === 0 || random() < 1 - rate) return null;
    const weighted = ANOMALIES.map(item => ({ item, weight: CONFIG.anomalyWeights[item.id] ?? 0 }))
      .filter(entry => Number.isFinite(entry.weight) && entry.weight > 0);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (!total) return null;
    let choice = random() * total;
    for (const { item, weight } of weighted) {
      if (choice < weight) return item;
      choice -= weight;
    }
    return weighted.at(-1).item;
  }
  function blockX(block, distance) { return block.anchor + block.direction * distance; }
  class Run {
    constructor(random = Math.random, { anomalyRate = ANOMALY_RATE } = {}) {
      if (!Number.isFinite(anomalyRate) || anomalyRate < 0 || anomalyRate > 1) throw new RangeError("anomalyRate must be 0–1");
      this.random = random;
      this.anomalyRate = anomalyRate;
      this.debugAnomaly = null;
      this.reset();
    }
    reset() {
      this.phase = "title";
      this.x = WORLD.start;
      this.worldOffset = 0;
      this.cameraFollowing = false;
      this.entranceClosed = false;
      this.inBlock = false;
      this.currentRoom = 1;
      this.nextFinalNormal = false;
      this.serial = 0;
      this.enteredRoom = null;
      this.lastDecision = null;
      this.trailing = null;
      this.active = this.createBlock(WORLD.entranceLength, 1, true);
    }
    createBlock(anchor, direction, tutorial = false) {
      // Exactly one assignment per block, including the final class.
      const guaranteedNormal = this.currentRoom === LAST_CLASS && this.nextFinalNormal;
      if (guaranteedNormal) this.nextFinalNormal = false;
      const anomaly = tutorial || guaranteedNormal
        ? null : selectAnomaly(this.random, this.anomalyRate, this.debugAnomaly);
      return { id: ++this.serial, anchor, direction, room: this.currentRoom,
        anomaly, judged: false, tutorial, finalArrival: false, elapsed: 0, furthest: 0 };
    }
    setDebugAnomaly(id = null) {
      if (id !== null && id !== "NORMAL" && !ANOMALIES.some(item => item.id === id)) throw new RangeError("Unknown anomaly ID");
      // Setting this never mutates the currently selected round.
      this.debugAnomaly = id;
    }
    restartDebugBlock() {
      if (this.phase !== "corridor" || !this.inBlock || this.active.tutorial) return false;
      this.active = this.createBlock(this.active.anchor, this.active.direction);
      return true;
    }
    start() { this.reset(); this.phase = "corridor"; }
    get anomaly() { return this.active.anomaly; }
    get localX() { return (this.x - this.active.anchor) * this.active.direction; }
    get travelX() { return this.x + this.worldOffset; }
    get visibleBlocks() { return this.trailing ? [this.trailing, this.active] : [this.active]; }
    get canEnterFinal() {
      return this.phase === "corridor" && this.inBlock && this.currentRoom === LAST_CLASS
        && !this.anomaly && this.active.finalArrival
        && Math.abs(this.localX - CORRIDOR.doors[1]) <= WORLD.entryRadius;
    }
    tick(seconds) {
      if (this.phase !== "corridor" || !this.inBlock || !Number.isFinite(seconds) || seconds <= 0) return;
      this.active.elapsed += seconds;
      this.active.furthest = Math.max(this.active.furthest, this.localX);
    }
    move(direction, seconds) {
      if (this.phase !== "corridor" || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(direction) || !direction) return null;
      direction = Math.sign(direction);
      // A single update cannot tunnel across multiple blocks, even after a long pause.
      this.x += direction * WORLD.speed * Math.min(seconds, .05);
      if (!this.entranceClosed) {
        this.x = Math.max(35, this.x);
        if (this.x >= WORLD.entranceLength) { this.entranceClosed = true; this.inBlock = true; }
      }
      if (this.x >= 480) this.cameraFollowing = true;
      if (!this.inBlock) return null;
      const block = this.active;
      // The NORMAL final classroom ends here: retain the same round and allow
      // walking back to its rear door, rather than generating another class 8.
      if (this.currentRoom === LAST_CLASS && !block.anomaly && direction === block.direction) {
        const end = blockX(block, WORLD.length - WORLD.playerRadius);
        this.x = block.direction === 1 ? Math.min(this.x, end) : Math.max(this.x, end);
      }
      block.furthest = Math.max(block.furthest, this.localX);
      // Arrival is separate from a boundary judgement. Only a forward approach
      // to the NORMAL final class's rear door unlocks entry; it never auto-clears.
      if (this.currentRoom === LAST_CLASS && !block.anomaly && direction === block.direction
        && Math.abs(this.localX - CORRIDOR.doors[1]) <= WORLD.entryRadius) block.finalArrival = true;
      // Turning, inspecting, and passing a door never commit a choice.
      const forward = this.localX > WORLD.length + WORLD.playerRadius;
      const backward = this.localX < -WORLD.playerRadius;
      if (!forward && !backward) return null;
      if (block.judged) return null;
      block.judged = true;
      const correct = block.anomaly ? backward : forward;
      const from = this.currentRoom;
      // Only a committed, correct retreat in class 8 guarantees its next block.
      this.nextFinalNormal = from === LAST_CLASS && correct && !!block.anomaly && backward;
      this.currentRoom = correct ? Math.min(from + 1, LAST_CLASS) : 1;
      const exitDirection = forward ? block.direction : -block.direction;
      const boundary = blockX(block, forward ? WORLD.length : 0);
      this.lastDecision = Object.freeze({ type: "decision", blockId: block.id,
        correct, from, to: this.currentRoom, direction: exitDirection });
      // Keep only the just-finished block for drawing behind the player. The older
      // block is discarded, NEVER revisited. Coordinates stay bounded by rebasing
      // the player and decorations together; their screen positions do not change.
      this.x -= boundary;
      this.worldOffset += boundary;
      block.anchor -= boundary;
      this.trailing = block;
      this.active = this.createBlock(0, exitDirection);
      return this.lastDecision;
    }
    enter() {
      if (this.phase !== "corridor") return { type: "none" };
      if (!this.inBlock || !CORRIDOR.doors.some(at => Math.abs(this.localX - at) <= WORLD.entryRadius)) return { type: "away" };
      if (this.currentRoom === LAST_CLASS) {
        if (!this.canEnterFinal) return { type: "none" };
        this.active.judged = true;
        this.lastDecision = Object.freeze({ type: "decision", blockId: this.active.id,
          correct: true, from: LAST_CLASS, to: LAST_CLASS, direction: this.active.direction });
      }
      this.enteredRoom = this.currentRoom;
      this.phase = this.currentRoom === LAST_CLASS ? "end" : "gameover";
      return { type: this.phase, room: this.enteredRoom };
    }
  }
  function cameraX(run, width = 960) {
    return run.cameraFollowing ? run.x - width / 2 : Math.max(0, run.x - width / 2);
  }
  const api = Object.freeze({ LAST_CLASS, ANOMALY_RATE, ANOMALIES, WORLD, CORRIDOR, blockX, Run, cameraX });
  root.SchoolRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
