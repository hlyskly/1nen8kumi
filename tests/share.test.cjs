'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {TitleShare,payload,links}=require('../share.js');
const data=require('../shareData.js');
function fixture(navigator={},options={}){
 const items={};const doc={createElement(){return {style:{},focus(){},select(){},remove(){}};},execCommand(){return !!options.legacy;},getElementById(id){return items[id]??=( {style:{},hidden:true,open:false,disabled:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},focus(){doc.focus=this;},select(){this.selected=true;},appendChild(){},showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();}});}};
 const host={location:{href:options.href||'https://example.com/game/?debug=1#temporary'},navigator};
 const share=new TitleShare(doc,host,()=>options.allowed!==false,options.data||data);
 return {share,items,doc};
}
test('data supplies title/text; current URL removes query/hash, fixed URL preserves its intended data',()=>{
 assert.deepEqual(payload(data,'https://example.com/game/?debug=1#x'),{title:data.title,text:data.text,url:'https://example.com/game/'});
 assert.equal(payload({...data,url:'https://fixed.example/play/?campaign=abc#intro'},'https://example.com/').url,'https://fixed.example/play/?campaign=abc#intro');
 const edited={title:'変更したタイトル',text:'日本語 & ? + #',url:''};const p=payload(edited,'https://example.com/');
 for(const target of [links(p).line,links(p).x]){const u=new URL(target);assert.equal(u.searchParams.get('text'),edited.text);assert.equal(u.searchParams.get('url'),p.url);}
 const mail=new URL(links(p).mail);assert.equal(mail.protocol,'mailto:');assert.equal(mail.searchParams.get('subject'),edited.title);assert.equal(mail.searchParams.get('body'),`${edited.text}\r\n\r\n${p.url}`);
 const facebook=new URL(links(p).facebook);assert.equal(facebook.origin,'https://www.facebook.com');assert.equal(facebook.pathname,'/sharer/sharer.php');assert.equal(facebook.searchParams.get('u'),p.url);assert.equal([...facebook.searchParams].length,1);
 assert.equal(payload(data,'file:///tmp/index.html?debug=1#x').url,'file:///tmp/index.html');
});
test('native sharing is synchronous from gesture, blocks duplicate requests and starts nothing else',async()=>{
 let resolve;const calls=[];const f=fixture({share(p){calls.push(p);return new Promise(r=>resolve=r);}});
 const request=f.share.share();assert.equal(calls.length,1);assert.equal(f.share.busy,true);await f.share.share();assert.equal(calls.length,1);
 resolve();await request;assert.equal(f.share.open,false);assert.equal(f.share.busy,false);assert.equal(f.items['title-share'].disabled,false);
 assert.deepEqual(calls[0],payload(data,'https://example.com/game/'));
 const denied=fixture({share(){throw Error('must not call');}},{allowed:false});await denied.share.share();assert.equal(denied.share.busy,false);
});
test('native cancellation is quiet; unavailable and failed native sharing offer menu',async()=>{
 const cancel=fixture({share(){return Promise.reject(Object.assign(Error('cancel'),{name:'AbortError'}));}});await cancel.share.share();assert.equal(cancel.share.open,false);assert.equal(cancel.items['share-message'].textContent,undefined);
 for(const nav of [{},{share(){throw Error('denied');}}]){const f=fixture(nav);await f.share.share();assert.equal(f.share.open,true);assert.equal(new URL(f.items['share-line'].href).searchParams.get('url'),'https://example.com/game/');f.share.close();assert.equal(f.share.open,false);assert.equal(f.doc.focus,f.items['title-share']);}
});
test('clipboard succeeds, legacy fallback succeeds, failure provides manually selectable URL',async()=>{
 const copied=[];const f=fixture({clipboard:{async writeText(v){copied.push(v);}}});await f.share.share();await f.share.copy();assert.deepEqual(copied,['https://example.com/game/']);assert.equal(f.items['share-message'].textContent,'リンクをコピーしました');
 const legacy=fixture({}, {legacy:true});await legacy.share.share();await legacy.share.copy();assert.equal(legacy.items['share-message'].textContent,'リンクをコピーしました');
 const failed=fixture({clipboard:{writeText(){throw Error('denied');}}},{href:'file:///tmp/index.html'});await failed.share.share();await failed.share.copy();assert.equal(failed.items['share-url'].hidden,false);assert.equal(failed.items['share-url'].selected,true);assert.equal(failed.items['share-url'].value,'file:///tmp/index.html');assert.equal(failed.share.copying,false);
});
