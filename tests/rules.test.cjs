"use strict";
const assert = require("node:assert/strict");
const { Run, WORLD, CORRIDOR, ANOMALIES, ANOMALY_RATE, LAST_CLASS, blockX, cameraX } = require("../rules.js");
let checks = 0;
function test(name, body) { body(); checks++; console.log(`PASS ${name}`); }
function makeRun(id = null) {
  let samples = 0;
  const index = ANOMALIES.findIndex(item => item.id === id);
  const run = new Run(() => { samples++; return id === null ? .1 : (samples % 2 ? .9 : (index + .5) / ANOMALIES.length); });
  run.start(); return { run, samples: () => samples };
}
function walkTo(run, target) {
  for (let i = 0; Math.abs(run.travelX - target) > .00001; i++) {
    assert.ok(i < 20000, "target reachable");
    const before = run.travelX;
    run.move(Math.sign(target - before), Math.min(5, Math.abs(target - before)) / WORLD.speed);
    assert.notEqual(run.travelX, before);
  }
}
function local(run, at) { walkTo(run, run.travelX + run.active.direction * (at - run.localX)); }
function first(run) { local(run, 1200); }
function exit(run, forward = !run.anomaly) { local(run, forward ? WORLD.length + WORLD.playerRadius + 5 : -WORLD.playerRadius - 5); }
function advance(run, goal = LAST_CLASS) { first(run); while (run.currentRoom < goal) exit(run); }

test("1–2: starts at lockers; initial class 1 is a normal tutorial with no random sample", () => {
  const { run, samples } = makeRun("dog");
  assert.equal(run.x, WORLD.start); assert.equal(run.inBlock, false); assert.equal(run.entranceClosed, false);
  first(run); assert.equal(run.currentRoom, 1); assert.equal(run.active.tutorial, true);
  assert.equal(run.anomaly, null); assert.equal(samples(), 0);
});
test("3–4,12: immutable template has exactly two doors, three windows, one board and fixed NPCs in entry order", () => {
  assert.equal(CORRIDOR.doors.length, 2); assert.equal(CORRIDOR.windows.length, 3); assert.equal(CORRIDOR.boards.length, 1);
  assert.deepEqual(CORRIDOR.sequence, ["frontDoor", "window", "windowWithGirls", "window", "rearDoor", "emptyWall", "boardWithBoy", "column"]);
  const ordered = [CORRIDOR.doors[0], ...CORRIDOR.windows, CORRIDOR.doors[1], CORRIDOR.boards[0], CORRIDOR.columns[0]];
  for (const direction of [1, -1]) {
    const block = { anchor: 0, direction };
    const distances = ordered.map(at => blockX(block, at) * direction);
    assert.deepEqual(distances, ordered); assert.ok(distances.every((at, i) => !i || at > distances[i - 1]));
  }
  assert.deepEqual(CORRIDOR.npcs.map(n => [n.at, n.female, n.facing, n.action]), [[1620, true, 1, "talk"], [1700, true, -1, "talk"], [2670, false, 0, "board"]]);
  for (const value of Object.values(CORRIDOR)) assert.ok(Object.isFrozen(value));
  CORRIDOR.npcs.forEach(npc => assert.ok(Object.isFrozen(npc)));
});
test("5–6: turns and doors never judge; body must entirely leave either end", () => {
  for (const forward of [true, false]) {
    const { run, samples } = makeRun(); first(run); const block = run.active;
    for (let i = 0; i < 6; i++) { local(run, WORLD.length - 300); local(run, 400); }
    assert.equal(run.active, block); assert.equal(run.lastDecision, null); assert.equal(samples(), 0);
    local(run, forward ? WORLD.length + WORLD.playerRadius : -WORLD.playerRadius);
    assert.equal(run.active, block); assert.equal(block.judged, false);
    run.move(forward ? 1 : -1, .02);
    assert.equal(block.judged, true); assert.notEqual(run.active.id, block.id);
  }
});
for (const id of [null, ...ANOMALIES.map(a => a.id)]) {
  test(`7–10,13: ${id ?? "normal"} keeps one assignment through reversals and judges both exits correctly`, () => {
    for (const forward of [true, false]) {
      const { run, samples } = makeRun(id); first(run); exit(run, true);
      assert.equal(run.currentRoom, 2); const block = run.active, draws = samples();
      assert.equal(run.anomaly?.id ?? null, id);
      for (let i = 0; i < 4; i++) { local(run, WORLD.length - 100); local(run, 500); run.tick(1); }
      assert.equal(run.active, block); assert.equal(samples(), draws);
      exit(run, forward);
      const correct = id ? !forward : forward;
      assert.equal(run.lastDecision.correct, correct); assert.equal(run.currentRoom, correct ? 3 : 1);
      assert.equal(run.lastDecision.blockId, block.id); assert.equal(run.phase, "corridor");
    }
  });
}
test("11: reversal creates a fresh mirrored block in place of old history", () => {
  const { run } = makeRun("dog"); first(run); const tutorial = run.active; exit(run, true);
  const anomalyBlock = run.active; local(run, WORLD.length - 100); exit(run, false);
  assert.equal(run.currentRoom, 3); assert.equal(run.active.direction, -1);
  assert.equal(run.active.anchor, 0); assert.equal(anomalyBlock.anchor, 0);
  assert.ok(run.localX > WORLD.playerRadius); assert.equal(run.trailing, anomalyBlock);
  assert.equal(run.visibleBlocks.includes(tutorial), false); assert.notEqual(run.active, tutorial);
  assert.equal(run.visibleBlocks.length, 2);
  assert.ok(blockX(run.active, CORRIDOR.doors[0]) < run.x);
});
test("14–17: successful routes advance exactly one class per exit and reach 8 in either direction", () => {
  for (const id of [null, "dog"]) {
    const { run } = makeRun(id); first(run);
    if (id) { let n = 0; run.random = () => ++n <= 2 ? .9 : .1; }
    for (let room = 1; room < LAST_CLASS; room++) {
      assert.equal(run.currentRoom, room); const old = run.active;
      exit(run); assert.equal(run.currentRoom, room + 1); assert.equal(run.lastDecision.from, room);
      assert.equal(run.lastDecision.to, room + 1); assert.equal(run.active.id, old.id + 1);
      assert.ok(run.visibleBlocks.length <= 2); assert.equal(run.entranceClosed, true);
    }
    assert.equal(run.anomaly, null); assert.equal(run.active.direction, id ? -1 : 1);
  }
});
test("failure to 1 never restores lockers or the tutorial guarantee", () => {
  for (const id of [null, "light"]) {
    const { run } = makeRun(id); advance(run, 5); exit(run, !!id);
    assert.equal(run.currentRoom, 1); assert.equal(run.active.tutorial, false);
    assert.equal(run.entranceClosed, true); assert.equal(run.inBlock, true);
    assert.equal(run.anomaly?.id ?? null, id);
  }
});
function finalRun(direction = 1) {
  const { run } = makeRun(); first(run);
  if (direction === -1) {
    run.setDebugAnomaly("hole"); exit(run, true);
    run.setDebugAnomaly("NORMAL"); exit(run, false);
  }
  advance(run); return run;
}
test("NORMAL class 8 clears only at its rear door after forward arrival, in both directions", () => {
  for (const direction of [1,-1]) {
    const run = finalRun(direction); assert.equal(run.active.direction, direction);
    assert.equal(run.active.finalArrival, false); assert.equal(run.canEnterFinal, false);
    local(run, CORRIDOR.doors[0]); assert.equal(run.enter().type, "none");
    local(run, 1800); assert.equal(run.enter().type, "away");
    local(run, CORRIDOR.doors[1]); assert.equal(run.phase, "corridor");
    assert.equal(run.canEnterFinal, true); assert.equal(run.active.judged, false);
    assert.equal(run.enter().type, "end"); assert.equal(run.active.judged, true);
    assert.equal(run.lastDecision.from, 8); assert.equal(run.lastDecision.correct, true);
    assert.equal(run.move(1, 1), null);
  }
  const { run } = makeRun(); assert.equal(run.enter().type, "away");
  first(run); local(run, CORRIDOR.doors[1]); assert.equal(run.enter().type, "gameover");
});
test("NORMAL class 8 stops at its forward end, preserves the round and permits rear-door entry; wrong return resets", () => {
  for (const direction of [1,-1]) {
    const run = finalRun(direction), block = run.active, decision = run.lastDecision, serial = run.serial;
    local(run,WORLD.length-WORLD.playerRadius);
    for(let i=0;i<400;i++) assert.equal(run.move(direction,.05),null);
    assert.equal(run.localX,WORLD.length-WORLD.playerRadius);
    assert.equal(run.active,block); assert.equal(run.serial,serial); assert.equal(run.currentRoom,8);
    assert.equal(block.judged,false); assert.equal(run.lastDecision,decision);
    local(run,CORRIDOR.doors[1]); assert.equal(run.canEnterFinal,true); assert.equal(run.enter().type,"end");
    const wrong = finalRun(direction); exit(wrong,false);
    assert.equal(wrong.currentRoom,1); assert.equal(wrong.lastDecision.correct,false);
  }
});
for (const item of ANOMALIES) test(`final ${item.id}: entry blocked; return retries 8; advancing resets to 1`, () => {
  for (const direction of [1,-1]) for (const forward of [true,false]) {
    const run = finalRun(direction); run.setDebugAnomaly(item.id); assert.equal(run.restartDebugBlock(), true);
    const block = run.active; local(run, CORRIDOR.doors[1]);
    assert.equal(run.anomaly, item); assert.equal(run.canEnterFinal, false); assert.equal(run.enter().type, "none");
    run.setDebugAnomaly("NORMAL"); exit(run, forward);
    assert.equal(block.judged, true); assert.equal(run.lastDecision.correct, !forward);
    assert.equal(run.currentRoom, forward ? 1 : 8); assert.equal(run.anomaly, null);
    assert.equal(run.phase, "corridor"); assert.equal(run.active.finalArrival, false);
    if (!forward) { local(run, CORRIDOR.doors[1]); assert.equal(run.enter().type, "end"); }
  }
});
test("class 8 uses ordinary random selection and keeps it through reversals", () => {
  for (const item of [null,...ANOMALIES]) {
    const { run, samples } = makeRun(item?.id ?? null); advance(run);
    assert.equal(run.anomaly, item); const before = samples(), block = run.active;
    local(run, 3200); local(run, 1800); assert.equal(run.active, block); assert.equal(samples(), before);
  }
});
test("21: coordinate rebase preserves player, old objects and camera without a screen jump", () => {
  for (const id of [null, "dog"]) {
    const { run } = makeRun(id); first(run); exit(run, true);
    const block = run.active, forward = !run.anomaly;
    local(run, forward ? WORLD.length + WORLD.playerRadius : -WORLD.playerRadius);
    const x = run.travelX, camera = cameraX(run), objects = CORRIDOR.doors.map(at => blockX(block, at) - camera);
    const direction = block.direction * (forward ? 1 : -1);
    run.move(direction, .02);
    assert.equal(run.travelX, x + direction * WORLD.speed * .02); assert.equal(run.x - cameraX(run), 480);
    assert.deepEqual(CORRIDOR.doors.map(at => blockX(block, at) - cameraX(run)), objects.map(x => x - direction * WORLD.speed * .02));
    assert.equal(CORRIDOR.doors[0] - 100, CORRIDOR.zones.classroom.start);
    assert.equal(WORLD.length - (CORRIDOR.columns[0] + 45), WORLD.length - CORRIDOR.zones.classroom.end);
  }
});
test("long frames cannot skip multiple classes; hundreds of blocks retain bounded state", () => {
  const { run } = makeRun(); first(run);
  for (let i = 0; i < 200; i++) {
    const block = run.active; local(run, -WORLD.playerRadius); run.move(-block.direction, 1e6);
    assert.equal(run.currentRoom, 1); assert.equal(run.active.id, block.id + 1);
    assert.ok(Math.abs(run.x) < 100); assert.equal(run.visibleBlocks.length, 2);
  }
  for (const invalid of [NaN, Infinity, -1, 0]) {
    const x = run.x; run.move(1, invalid); assert.equal(run.x, x);
  }
});
test("camera starts with free movement then follows left and right continuously; restart restores entrance", () => {
  const { run } = makeRun(); walkTo(run, 440); assert.equal(cameraX(run), 0);
  walkTo(run, 600); assert.equal(run.x - cameraX(run), 480);
  walkTo(run, 400); assert.equal(run.x - cameraX(run), 480);
  run.start(); assert.equal(run.x, WORLD.start); assert.equal(cameraX(run), 0); assert.equal(run.entranceClosed, false);
});
test("every nonfinal class resets once on a wrong exit, including leftward travel", () => {
  for (let room = 1; room <= LAST_CLASS; room++) {
    for (const leftward of [false, true]) {
      const { run } = makeRun();
      if (leftward && room >= 3) { let n = 0; run.random = () => ++n <= 2 ? .9 : .1; }
      advance(run, room);
      if (leftward && room >= 3) assert.equal(run.active.direction, -1);
      const previous = run.active;
      exit(run, !!run.anomaly);
      assert.equal(run.currentRoom, 1); assert.equal(run.lastDecision.correct, false);
      assert.equal(run.lastDecision.from, room); assert.equal(run.lastDecision.to, 1);
      assert.equal(run.active.id, previous.id + 1); assert.equal(run.entranceClosed, true);
    }
  }
});
test("independent wall zone places judgement well beyond the classroom, with equipment outside the turnaround view", () => {
  const { classroom, wall } = CORRIDOR.zones;
  assert.equal(CORRIDOR.sequence.length, 8);
  assert.equal(classroom.start, CORRIDOR.doors[0] - 100);
  assert.equal(classroom.end, CORRIDOR.columns[0] + 45);
  assert.equal(wall.start, classroom.end);
  assert.equal(wall.decision, WORLD.length);
  assert.equal(wall.end, WORLD.length + classroom.start);
  assert.ok(wall.start < wall.decision && wall.decision < wall.end);
  const guard = 480 + WORLD.playerRadius + WORLD.speed * .05;
  assert.ok(wall.decision - wall.start > guard);
  assert.ok(wall.end - wall.decision > guard);
  assert.ok(wall.end - wall.start < 960 * 1.7, "wall should be only as long as the hidden transition needs");
  for (const positions of [CORRIDOR.doors, CORRIDOR.windows, CORRIDOR.boards, CORRIDOR.lamps]) {
    for (const at of positions) assert.ok(at > classroom.start && at < classroom.end);
  }
  for (const npc of CORRIDOR.npcs) assert.ok(npc.at > classroom.start && npc.at < classroom.end);
  for (const offset of wall.pillarOffsets) assert.ok(wall.decision + offset > wall.start && wall.decision + offset < wall.end);
});
test("ten immutable static definitions target existing classroom fixtures; probability is configurable", () => {
  assert.equal(ANOMALIES.length, 10); assert.equal(new Set(ANOMALIES.map(a => a.id)).size, 10);
  assert.equal(ANOMALY_RATE, require("../config.js").anomalyRate);
  ANOMALIES.forEach((item, index) => {
    assert.ok(Object.isFrozen(item)); assert.equal(item.type, "static");
    assert.equal(item.code, `ANOMALY ${String(index + 1).padStart(2, "0")}`);
    assert.ok(item.at > CORRIDOR.zones.classroom.start && item.at < CORRIDOR.zones.classroom.end);
    const fixtures = { lamp: CORRIDOR.lamps, window: CORRIDOR.windows, board: CORRIDOR.boards };
    if (fixtures[item.target]) assert.ok(fixtures[item.target].includes(item.at));
  });
  for (const [rate, expected] of [[0, null], [1, "hole"]]) {
    const run = new Run(() => 0, { anomalyRate: rate }); run.start(); first(run); exit(run, true);
    assert.equal(run.anomaly?.id ?? null, expected);
  }
  assert.throws(() => new Run(Math.random, { anomalyRate: -1 }), RangeError);
});
test("selection threshold covers NORMAL and all ten distinct buckets", () => {
  for (const [roll, expected] of [[.499999, null], [.5, "hole"]]) {
    let n = 0; const run = new Run(() => ++n % 2 ? roll : 0, { anomalyRate: .5 });
    run.start(); first(run); exit(run, true); assert.equal(run.anomaly?.id ?? null, expected);
  }
  for (const anomaly of ANOMALIES) {
    const { run, samples } = makeRun(anomaly.id); first(run); exit(run, true);
    assert.equal(run.anomaly, anomaly); assert.equal(samples(), 2);
  }
});
test("debug changes future selection only; explicit restart makes a fresh inspection round without judging", () => {
  const { run, samples } = makeRun(); run.setDebugAnomaly("blood");
  first(run); assert.equal(run.anomaly, null); assert.equal(run.restartDebugBlock(), false);
  exit(run, true); assert.equal(run.anomaly.id, "blood"); assert.equal(samples(), 0);
  const old = run.active, x = run.travelX, decision = run.lastDecision;
  run.setDebugAnomaly("knife"); assert.equal(run.active, old); assert.equal(run.anomaly.id, "blood");
  assert.equal(run.restartDebugBlock(), true); assert.notEqual(run.active.id, old.id);
  assert.equal(run.anomaly.id, "knife"); assert.equal(run.currentRoom, 2);
  assert.equal(run.travelX, x); assert.equal(run.lastDecision, decision);
  run.setDebugAnomaly("NORMAL"); exit(run, false); assert.equal(run.anomaly, null);
  advance(run); run.setDebugAnomaly("dog"); assert.equal(run.restartDebugBlock(), true); assert.equal(run.anomaly.id, "dog");
  assert.throws(() => run.setDebugAnomaly("missing"), RangeError);
});
test("each anomaly alone can be followed through class 8 and entered without skipping a class", () => {
  for (const item of ANOMALIES) {
    const { run } = makeRun(item.id); first(run);
    for (let room = 1; room < LAST_CLASS; room++) { exit(run); assert.equal(run.currentRoom, room + 1); }
    assert.equal(run.anomaly.id, item.id); run.setDebugAnomaly("NORMAL"); exit(run, false);
    assert.equal(run.currentRoom, LAST_CLASS); local(run, CORRIDOR.doors[1]); assert.equal(run.enter().type, "end");
  }
});
test("class 8 correct anomaly retreat consumes one NORMAL guarantee without resampling", () => {
  for (const id of ANOMALIES.map(a => a.id)) {
    const {run,samples}=makeRun(id); advance(run);
    assert.equal(run.anomaly.id,id);const count=samples();const block=run.active;
    local(run,1200);local(run,500);assert.equal(run.active,block);assert.equal(run.nextFinalNormal,false);
    exit(run,false);assert.equal(run.lastDecision.correct,true);assert.equal(run.currentRoom,8);
    assert.equal(run.anomaly,null);assert.equal(samples(),count);assert.equal(run.nextFinalNormal,false);
    local(run,CORRIDOR.doors[1]);assert.equal(run.canEnterFinal,true);assert.equal(run.enter().type,"end");
    run.start();assert.equal(run.nextFinalNormal,false);assert.equal(run.active.tutorial,true);
    advance(run);assert.equal(run.anomaly.id,id);
  }
});
test("incorrect final anomaly advance never grants NORMAL; earlier retreats still draw anomalies", () => {
  const {run}=makeRun("dog");advance(run);exit(run,true);
  assert.equal(run.currentRoom,1);assert.equal(run.nextFinalNormal,false);assert.equal(run.anomaly.id,"dog");
  run.start();first(run);exit(run,true);assert.equal(run.currentRoom,2);assert.equal(run.anomaly.id,"dog");
  exit(run,false);assert.equal(run.currentRoom,3);assert.equal(run.anomaly.id,"dog");
});
console.log(`\n${checks} rule checks passed.`);
