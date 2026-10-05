"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const { GameAudio, AUDIO_VOLUME, FILES } = require("../audio.js");
function fixture({ failed = false, denied = false } = {}) {
  const sources = [], requests = []; let contexts = 0;
  class Context {
    constructor() { contexts++; this.state = "suspended"; this.destination = {}; }
    resume() { if (denied) return Promise.reject(Error("denied")); this.state = "running"; return Promise.resolve(); }
    async decodeAudioData(bytes) { return { id: bytes.id }; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    createBufferSource() {
      const source = { connect(gain) { this.volume = gain.gain; }, disconnect() {}, start(at) { this.startAt = at; sources.push(this); }, stop() { this.stopped = true; this.onended?.(); } };
      return source;
    }
  }
  const audio = new GameAudio({ AudioContext: Context, async fetch(url) {
    requests.push(url); if (failed) throw Error("missing");
    return { ok: true, async arrayBuffer() { return { id: url.split("/").pop() }; } };
  } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return { audio, sources, requests, settle, get contexts() { return contexts; } };
}
test("six assets preload without an audio context or title playback; start is unique and deferred decode respects stop", async () => {
  const f = fixture(); await f.settle(); assert.equal(f.requests.length,6); assert.equal(f.contexts,0); assert.equal(f.sources.length,0);
  f.audio.unlock(); f.audio.startGameAmbience(); f.audio.startGameAmbience(); await f.settle();
  assert.equal(f.contexts,1); assert.equal(f.sources.length,2);
  assert.deepEqual(f.sources.map(s=>[s.buffer.id,s.loop,s.volume.value]),[[FILES.ambience,true,.12],[FILES.fluorescent,true,.07]]);
  f.audio.unlock(); f.audio.startGameAmbience(); await f.settle(); assert.equal(f.sources.length,2);
  f.audio.stopGameAmbience(); assert.ok(f.sources.every(s=>s.stopped));
  f.audio.startGameAmbience(); assert.equal(f.sources.length,4);
  const g=fixture();g.audio.unlock();g.audio.startGameAmbience();g.audio.stopGameAmbience();await g.settle();assert.equal(g.sources.length,0);
});
test("walk01/walk04 trigger once on frame entry, restart and reversal use the same cycle, idle stops the tail", async () => {
  const f=fixture();f.audio.unlock();await f.settle();f.audio.startGameAmbience();
  for(const frame of [0,0,0,1,2,3,3,4,5,0])f.audio.updateWalking(frame);
  const steps=f.sources.filter(s=>s.buffer.id.startsWith("footstep"));
  assert.deepEqual(steps.map(s=>s.buffer.id),[FILES.footstep1,FILES.footstep2,FILES.footstep1]);
  assert.ok(steps.every(s=>!s.loop && s.volume.value===.28 && s.startAt===0));
  f.audio.updateWalking(null);assert.ok(steps.at(-1).stopped);f.audio.updateWalking(null);assert.equal(f.sources.length,5);
  f.audio.updateWalking(0);assert.equal(f.sources.at(-1).buffer.id,FILES.footstep1);
  f.audio.stopGameAmbience();f.audio.updateWalking(3);assert.equal(f.sources.length,6);
});
test("door survives END loop stop; unavailable/blocked audio never throws or requires playback", async () => {
  const f=fixture();f.audio.unlock();await f.settle();f.audio.startGameAmbience();f.audio.stopGameAmbience();f.audio.playDoorSound();
  assert.equal(f.sources.at(-1).buffer.id,FILES.door);assert.equal(f.sources.at(-1).volume.value,.40);assert.equal(f.sources.at(-1).stopped,undefined);
  for(const options of [{failed:true},{denied:true}]) { const g=fixture(options);g.audio.unlock();g.audio.startGameAmbience();await g.settle();g.audio.updateWalking(0);g.audio.playDoorSound();g.audio.stopGameAmbience();assert.equal(g.sources.length,0); }
  const unavailable=new GameAudio({});unavailable.unlock();unavailable.startGameAmbience();unavailable.playDoorSound();await f.settle();
  assert.deepEqual(AUDIO_VOLUME,{ambience:.12,fluorescent:.07,footstep:.28,door:.40,chime:.40});
});

test("chime is queued once from the gesture, survives gameplay and ambience stops, and restarts once on the next title", async () => {
  const f=fixture();f.audio.unlock();f.audio.playChime();f.audio.playChime();await f.settle();
  const chimes=()=>f.sources.filter(s=>s.buffer.id===FILES.chime);
  assert.equal(chimes().length,1);assert.equal(chimes()[0].loop,false);assert.equal(chimes()[0].volume.value,.4);
  f.audio.startGameAmbience();f.audio.resetWalking();f.audio.stopGameAmbience();
  assert.equal(chimes()[0].stopped,undefined);
  chimes()[0].onended();f.audio.playChime();assert.equal(chimes().length,1);
  f.audio.armChime();f.audio.playChime();f.audio.playChime();assert.equal(chimes().length,2);assert.equal(chimes()[1].startAt,0);
});
