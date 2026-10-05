"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function configured(overrides={}) {
 const context=vm.createContext({console});
 for(const file of ['config.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 context.GAME_CONFIG={...context.GAME_CONFIG,...overrides};
 for(const file of ['rules.js','audio.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 return context;
}
function pick(context,samples=[.9,.5]) {
 let calls=0;const run=new context.SchoolRules.Run(()=>{const result=samples[calls++];assert.notEqual(result,undefined);return result;});
 run.start();assert.equal(run.anomaly,null);assert.equal(calls,0,'tutorial never samples');
 return run.createBlock(0,1).anomaly?.id ?? null;
}
test('default config preserves 250px/s, 50%, ten equal weights and original audio gains',()=>{
 const c=configured({walkSpeed:1,anomalyRate:.5});assert.equal(c.SchoolRules.WORLD.speed,250);assert.equal(c.SchoolRules.ANOMALY_RATE,.5);
 assert.equal(c.SchoolRules.ANOMALIES.length,10);
 assert.deepEqual(Object.keys(c.GAME_CONFIG.anomalyWeights).sort(),Array.from(c.SchoolRules.ANOMALIES,a=>a.id).sort());
 for(const weight of Object.values(c.GAME_CONFIG.anomalyWeights))assert.equal(weight,1);
 for(let i=0;i<10;i++)assert.equal(pick(c,[.9,(i+.5)/10]),c.SchoolRules.ANOMALIES[i].id);
 assert.equal(pick(c,[.49]),null);
});
test('walk multipliers 0, 0.8, 1, 1.2, 1.5 change only travel speed',()=>{
 for(const multiplier of [0,.8,1,1.2,1.5]) {
  const c=configured({walkSpeed:multiplier}),run=new c.SchoolRules.Run();run.start();const before=run.x;run.move(1,.04);
  assert.equal(run.x-before,10*multiplier);assert.equal(c.SchoolRules.WORLD.speed,250*multiplier);
  assert.equal(run.currentRoom,1);assert.equal(run.anomaly,null);
 }
});
test('rates 0/0.7/1 and fractional relative weights; zero weights and an empty pool never select',()=>{
 assert.equal(pick(configured({anomalyRate:0}),[]),null);
 const c=configured({anomalyRate:.7});assert.equal(pick(c,[.29]),null);assert.notEqual(pick(c,[.31,.1]),null);
 const all=configured({anomalyRate:1});assert.notEqual(pick(all,[0,0]),null);
 const weighted=configured({anomalyRate:1,anomalyWeights:{hole:1,dog:2,knife:.5}});
 for(const [sample,id]of [[0,'hole'],[.28,'hole'],[.29,'dog'],[.85,'dog'],[.86,'knife'],[.999,'knife']])assert.equal(pick(weighted,[0,sample]),id);
 assert.equal(pick(configured({anomalyRate:1,anomalyWeights:{dog:0,knife:2}}),[.9,.1]),'knife');
 const empty=configured({anomalyRate:1,anomalyWeights:{dog:0}});assert.equal(pick(empty,[.9]),null);
 // Debug is intentionally independent of rate/weights; final rounds still use the pool.
 const run=new empty.SchoolRules.Run(()=>.9);run.start();run.setDebugAnomaly('dog');assert.equal(run.createBlock(0,1).anomaly.id,'dog');
 run.setDebugAnomaly(null);run.currentRoom=8;assert.equal(run.createBlock(0,1).anomaly,null);
});
test('master and category multipliers combine with existing base gains, including silence',()=>{
 const gains=[];const c=configured({masterVolume:.8,ambientVolume:.5,lightVolume:.6,footstepVolume:.5,doorVolume:.25,chimeVolume:.6});
 const audio=new c.SchoolAudio.GameAudio({});audio.context={state:'running',destination:{},createBufferSource(){return{connect(){},start(){},disconnect(){}};},createGain(){const gain={gain:{},connect(){},disconnect(){}};gains.push(gain.gain);return gain;}};
 for(const [id,base]of [['ambience',.12],['fluorescent',.07],['footstep1',.28],['footstep2',.28],['door',.40],['chime',.40]]) {audio.buffers[id]={};audio.source(id,base);}
 assert.deepEqual(gains.map(g=>g.value),[.12*.8*.5,.07*.8*.6,.28*.8*.5,.28*.8*.5,.40*.8*.25,.40*.8*.6]);
 c.GAME_CONFIG.masterVolume=0;audio.source('door',.40);assert.equal(gains.at(-1).value,0);
});
test('config precedes consumers in HTML and is a PWA core asset',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const name of ['rules.js','audio.js','game.js'])assert.ok(html.indexOf('src="config.js"')<html.indexOf(`src="${name}"`));
 assert.match(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),/"\.\/config.js"/);
});
