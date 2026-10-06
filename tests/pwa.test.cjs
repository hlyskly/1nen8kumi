"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),origin='https://school.example';
const currentCache='ichinen8-cache-'+fs.readFileSync(path.join(root,'service-worker.js'),'utf8').match(/CACHE_VERSION = "([^"]+)"/)[1];
function worker(){
 const listeners={},stores=new Map(),deleted=[];let online=true,body='fresh',claimed=0;
 function cache(name){if(!stores.has(name))stores.set(name,new Map());const values=stores.get(name);return {
  async addAll(requests){for(const r of requests){assert.ok(fs.existsSync(path.join(root,new URL(r.url).pathname)));values.set(r.url,new Response('precache'));}},
  async put(key,response){values.set(typeof key==='string'?key:key.url,response.clone());},
  async match(key){return values.get(typeof key==='string'?key:key.url)?.clone();}
 };}
 const context=vm.createContext({URL,Response,Request:class extends Request{constructor(url,options){super(new URL(url,origin),options);}},Set,
  importScripts(...files){for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context);},
  self:{registration:{scope:origin+'/'},location:{origin},clients:{async claim(){claimed++;}},addEventListener:(name,fn)=>listeners[name]=fn},
  caches:{async open(name){return cache(name);},async keys(){return [...stores.keys()];},async delete(name){deleted.push(name);return stores.delete(name);}},
  async fetch(request,options){assert.equal(options.cache,'no-cache');if(!online)throw Error('offline');const r=new Response(body);Object.defineProperty(r,'type',{value:'basic'});return r;}
 });vm.runInContext(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),context);
 return {stores,deleted,get claimed(){return claimed;},async event(name){let pending;listeners[name]({waitUntil(p){pending=p;}});await pending;},
  network(value,text='fresh'){online=value;body=text;},fetch(url,mode='cors',method='GET'){let result;listeners.fetch({request:{url:origin+url,mode,method},respondWith(p){result=p;}});return result;}};
}
test('manifest preserves identity, standalone landscape, and all PNG icon dimensions',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest')));
 assert.equal(m.name,'1年8組');assert.equal(m.short_name,m.name);assert.equal(m.display,'standalone');assert.equal(m.orientation,'landscape');assert.equal(m.scope,'./');assert.equal(m.start_url,'./');
 for(const [file,size]of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180],['favicon-32.png',32]]){const png=fs.readFileSync(path.join(root,'assets/icons',file));assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
 assert.deepEqual(m.icons.map(i=>i.sizes),['192x192','512x512']);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(html,/rel="manifest"/);assert.match(html,/rel="apple-touch-icon"/);
});
test('worker precaches only existing core files and cleans only older game caches',async()=>{
 const w=worker();w.stores.set('ichinen8-cache-v0',new Map());w.stores.set('unrelated',new Map());await w.event('install');await w.event('activate');assert.deepEqual(w.deleted,['ichinen8-cache-v0']);assert.equal(w.stores.has(currentCache),true);assert.equal(w.stores.has('unrelated'),true);assert.equal(w.claimed,1);
});
test('fresh online responses replace cached scripts, offline falls back, uncached API and POST bypass worker',async()=>{
 const w=worker();await w.event('install');w.network(true,'new game');assert.equal(await(await w.fetch('/game.js')).text(),'new game');w.network(false);assert.equal(await(await w.fetch('/game.js')).text(),'new game');assert.equal(await(await w.fetch('/?launch=home','navigate')).text(),'precache');assert.equal(w.fetch('/api/private'),undefined);assert.equal(w.fetch('/game.js','cors','POST'),undefined);await assert.rejects(w.fetch('/assets/images/anomaly_dog.png'));
});

test('shared sprite/audio paths are all cacheable and load before their consumers',async()=>{
 const {PATHS,SPRITES,AUDIO_FILES}=require('../assetData.js');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const file of ['art.js','audio.js','title.js'])assert.ok(html.indexOf('src="assetData.js"')<html.indexOf(`src="${file}"`));
 assert.equal(PATHS.length,new Set(PATHS).size);
 const w=worker();await w.event('install');
 for(const file of [...Object.values(SPRITES).map(asset=>`./assets/images/${asset.file}`),...Object.values(AUDIO_FILES).map(file=>`./assets/audio/${file}`)])assert.ok(PATHS.includes(file));
 for(const file of PATHS){
  assert.ok(fs.existsSync(path.join(root,file)));
  assert.equal(await(await w.fetch(new URL(file,origin+'/').pathname)).text(),'fresh');
 }
 w.network(false);
 assert.equal(await(await w.fetch('/assets/images/anomaly_dog.png')).text(),'fresh');
 assert.equal(await(await w.fetch('/assets/audio/school_chime.mp3')).text(),'fresh');
});
