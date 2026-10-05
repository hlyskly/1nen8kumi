"use strict";
const assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const { ENDINGS, background } = require("../endingData.js");
const { SeenEndings, MemoryAssignments, ENDING_LIST, EndingPlayer, STORAGE_KEY, TIMING } = require("../endings.js");
let checks = 0;
function test(name, body) { body(); checks++; console.log(`PASS ${name}`); }
function reader(saved = new Map(), fixture = null) {
  const elements = {};
  const document = { getElementById(id) { return elements[id] ??= { hidden: false, style: {}, textContent: "", listeners: {}, classes: new Set(),
    classList: { add(value) { elements[id].classes.add(value); }, remove(value) { elements[id].classes.delete(value); } },
    focus() {}, addEventListener(type, fn) { this.listeners[type] = fn; } }; } };
  const progress = new SeenEndings({ getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) });
  let returned = 0;
  let Player = EndingPlayer;
  if(fixture) {
    const context = vm.createContext({ SchoolEndingData: {background, ENDINGS: {...ENDINGS,end1:{...ENDINGS.end1,pages:fixture}}} });
    vm.runInContext(fs.readFileSync(path.join(__dirname,"../endings.js"),"utf8"),context);
    Player = context.SchoolEndings.EndingPlayer;
  }
  const player = new Player(document, progress, () => returned++);
  return { player, progress, elements, saved, returned: () => returned };
}
function finish(player) {
  player.tick(TIMING.blackout);
  for (let page = 0; page < player.ending.pages.length; page++) {
    assert.equal(player.page, page);
    while (!player.revealed) player.advance(); // one input for each remaining line
    assert.equal(player.revealed, true);
    if (page + 1 < player.ending.pages.length) player.advance();
  }
  player.tick(TIMING.finish);
}
test("nine distinct editable data definitions use one shared classroom", () => {
  assert.equal(Object.keys(ENDINGS).length, 9);
  assert.equal(background, "assets/images/ending_classroom.png");
  assert.ok(Object.values(ENDINGS).every(e => Array.isArray(e.pages) && e.pages.length > 0 && e.pages.every(text => typeof text === "string" && text.length > 0)));
  assert.ok(ENDINGS.end8True.pages[6]);
  assert.equal(ENDINGS.end8True.darkenFromPage, 7);
});
for (let room = 1; room <= 7; room++) test(`END${room}: entry/partial reading never saves; full reading saves and survives reload`, () => {
  const app = reader(); const id = `end${room}`;
  assert.equal(id, `end${room}`); app.player.show(id);
  assert.equal(app.progress.seen.size, 0);
  app.player.tick(600); app.player.advance();
  assert.equal(app.progress.seen.size, 0);
  const partialReload = reader(app.saved); assert.equal(partialReload.progress.seen.size, 0);
  app.player.returnToTitle(); assert.equal(app.progress.seen.size, 0);
  app.player.show(id); finish(app.player);
  assert.deepEqual(JSON.parse(app.saved.get(STORAGE_KEY)), [String(room)]);
  assert.equal(reader(app.saved).progress.seen.has(String(room)), true);
  assert.equal(app.player.active, true); assert.equal(app.player.finished, true);
  app.player.advance(); assert.equal(app.player.active, false); assert.equal(app.returned(), 2);
});
test("additional lines require individual inputs and never appear automatically", () => {
  const { player, elements } = reader(new Map(), ["教室は静まり返っていた。", "倒れた机。\n割れた窓。\n床に広がる赤黒い跡。", "その中央に、一人の生徒が立っている。\n手には包丁。"]); player.show("end1");
  player.tick(200); player.advance(); assert.equal(elements["ending-text"].textContent, "");
  player.tick(100); assert.equal(elements["ending-text"].textContent, "教室は静まり返っていた。");
  player.advance(); assert.equal(player.page, 1);
  assert.equal(elements["ending-text"].textContent, "倒れた机。");
  player.tick(10000); assert.equal(elements["ending-text"].textContent, "倒れた机。");
  player.advance(); assert.equal(elements["ending-text"].textContent, "倒れた机。\n割れた窓。");
  player.tick(10000); assert.equal(elements["ending-text"].textContent, "倒れた机。\n割れた窓。");
  player.advance(); assert.equal(player.page, 1); assert.equal(player.revealed, true);
  player.advance(); assert.equal(player.page, 2);
  assert.equal(elements["ending-text"].textContent, "その中央に、一人の生徒が立っている。");
  player.show("end1"); finish(player); assert.equal(player.finished, true);
});
test("all-seven gate, debug mark/clear and malformed or denied localStorage are safe", () => {
  const app = reader(); for (let i = 1; i <= 6; i++) app.progress.mark(String(i));
  assert.equal(app.progress.endingFor(8), "end8Normal");
  app.progress.mark("7"); assert.equal(reader(app.saved).progress.endingFor(8), "end8True");
  app.progress.clear(); assert.equal(reader(app.saved).progress.complete, false);
  app.progress.markAll(); assert.equal(reader(app.saved).progress.complete, true);
  assert.ok(app.progress.status().includes("END7：既読"));
  assert.equal(new SeenEndings({ getItem() { throw Error(); }, setItem() { throw Error(); } }).complete, false);
  assert.equal(reader(new Map([[STORAGE_KEY, "broken"]])).progress.complete, false);
  const invalid = reader(new Map([[STORAGE_KEY, '["1","1","8",2]']])); assert.deepEqual([...invalid.progress.seen], ["1", "8"]);
});
test("normal remains bright; memory is neutral monochrome; true darkens gradually from page seven", () => {
  const app = reader(), p = app.player; p.show("end8Normal"); finish(p);
  assert.equal(app.elements["ending-background"].style.filter, "none");
  assert.equal(Number(app.elements["ending-shade"].style.opacity), 0);
  p.show("end1"); assert.equal(app.elements["ending-background"].style.filter, "grayscale(90%) brightness(60%)");
  assert.equal(Number(app.elements["ending-shade"].style.opacity), .45);
  p.show("end8True"); p.tick(500);
  while (p.page < 6) p.advance();
  assert.equal(p.page, 6); assert.equal(p.text, ENDINGS.end8True.pages[6]);
  assert.equal(Number(app.elements["ending-shade"].style.opacity), 0);
  p.tick(1250); assert.equal(Number(app.elements["ending-shade"].style.opacity), .275);
  p.tick(1250); assert.equal(Number(app.elements["ending-shade"].style.opacity), .55);
  assert.equal(app.progress.seen.size, 0); // 8 does not fabricate memory records
});
test("true END waits for input after its final line, fades to black, then pauses before END", () => {
  const {player:p,elements,progress}=reader(); p.show("end8True"); finish(p);
  assert.equal(p.finished,false); assert.equal(p.endTime,null); assert.equal(elements["ending-finish"].hidden,true);
  p.tick(10000); assert.equal(p.trueFadeTime,null); assert.equal(p.finished,false);
  p.advance(); assert.equal(p.trueFadeTime,0); assert.equal(elements["ending-hint"].hidden,true);
  p.tick(TIMING.trueFade/2); assert.equal(+elements["ending-blackout"].style.opacity,.5);
  p.advance(); assert.equal(p.trueFadeTime,TIMING.trueFade/2,"extra input does not skip the fade");
  p.tick(TIMING.trueFade/2); assert.equal(+elements["ending-blackout"].style.opacity,1);
  assert.equal(elements["ending-text"].hidden,true); assert.equal(elements["ending-finish"].hidden,true);
  p.tick(TIMING.truePause-1); assert.equal(p.finished,false);
  p.tick(1); assert.equal(p.finished,true); assert.equal(elements["ending-finish"].hidden,false);
  assert.deepEqual([...progress.seen],["9"]);
  p.advance(); assert.equal(p.active,false);
  p.show("end8Normal"); assert.equal(elements["ending-text"].hidden,false);
  assert.equal(elements["ending-screen"].classes.has("ending-true-finish"),false);
  finish(p); assert.equal(p.finished,false);
  p.advance(); p.tick(TIMING.normalFade + TIMING.normalPause); assert.equal(p.finished,true);
});


test("normal END waits for final input, fades to white and pauses before END; next END resets color", () => {
  const {player:p,elements,progress}=reader(); p.show("end8Normal"); finish(p);
  p.tick(10000); assert.equal(p.finished,false); assert.equal(p.normalFadeTime,null);
  p.advance(); assert.equal(elements["ending-blackout"].style.backgroundColor,"#fff");
  assert.equal(elements["ending-screen"].classes.has("ending-normal-finish"),true);
  p.tick(TIMING.normalFade/2); assert.equal(+elements["ending-blackout"].style.opacity,.5);
  p.advance(); assert.equal(p.normalFadeTime,TIMING.normalFade/2);
  p.tick(TIMING.normalFade/2); assert.equal(+elements["ending-blackout"].style.opacity,1);
  assert.equal(elements["ending-text"].hidden,true); assert.equal(elements["ending-finish"].hidden,true);
  p.tick(TIMING.normalPause-1); assert.equal(p.finished,false);
  p.tick(1); assert.equal(p.finished,true); assert.equal(elements["ending-finish"].hidden,false);
  assert.deepEqual([...progress.seen],["8"]); p.advance(); assert.equal(p.active,false);
  p.show("end8True"); assert.equal(elements["ending-blackout"].style.backgroundColor,"#000");
  assert.equal(elements["ending-screen"].classes.has("ending-normal-finish"),false);
});

test("unique classroom assignment follows first visits, repeats remain fixed and reset affects only assignments", () => {
  const assignments=new MemoryAssignments();
  assert.deepEqual([3,6,3,2].map(room=>assignments.endingFor(room)),["end1","end2","end1","end3"]);
  assert.equal(assignments.nextEndingIndex,3);
  for(const room of [7,1,4,5])assignments.endingFor(room);
  assert.equal(assignments.nextEndingIndex,7);assert.equal(assignments.endingFor(3),"end1");assert.equal(assignments.nextEndingIndex,7);
  assignments.reset();assert.equal(assignments.endingFor(7),"end1");
});
test("all nine unlocks persist independently; replay and debug never write unlocks", () => {
  const app=reader();app.progress.mark("8");app.progress.markAll();app.progress.mark("9");
  assert.equal(reader(app.saved).progress.seen.size,9);assert.equal(app.progress.complete,true);
  const saved=app.saved.get(STORAGE_KEY);
  for(const ending of ENDING_LIST) {
    app.player.show(ending.id,{library:true});finish(app.player);
    if(ending.key==="8"||ending.key==="9"){app.player.advance();app.player.tick(TIMING.trueFade+TIMING.truePause);}
    assert.equal(app.saved.get(STORAGE_KEY),saved);assert.equal(app.player.finished,true);
    app.player.returnToTitle();
  }
});
console.log(`\n${checks} ending checks passed.`);
