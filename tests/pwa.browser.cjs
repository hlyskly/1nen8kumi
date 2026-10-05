/* Optional real-browser QA. Serve repository on localhost; see README. */
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const url=process.env.PWA_TEST_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 fs.mkdirSync(path.join(__dirname,'../preview/pwa'),{recursive:true});
 for(const device of ['pc','android','iphone','standalone','no-worker']){
  const touch=device!=='pc';const context=await browser.newContext({viewport:touch?{width:844,height:390}:{width:1440,height:900},hasTouch:touch,isMobile:touch,...(device==='iphone'?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
  if(device==='standalone')await context.addInitScript(()=>{const match=window.matchMedia.bind(window);window.matchMedia=query=>query==='(display-mode: standalone)'?{matches:true,addEventListener(){}}:match(query);});
  if(device==='no-worker')await context.route('**/service-worker.js',route=>route.abort());
  await context.addInitScript(()=>{let rules;Object.defineProperty(window,'SchoolRules',{get:()=>rules,set:v=>{const Base=v.Run;rules={...v,Run:class extends Base{constructor(){super();window.qaRun=this;}}};}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!document.getElementById('title-start').disabled);
  const click=async id=>touch?page.locator('#'+id).tap():page.locator('#'+id).click();
  assert.equal(await page.locator('#title-screen').isVisible(),true);
  assert.equal(await page.locator('#pwa-install').isVisible(),device!=='standalone');
  if(device==='pc'||device==='iphone'){
   await click('pwa-install');assert.equal(await page.locator('#pwa-guide').evaluate(el=>el.open),true);
   if(device==='iphone')assert.match(await page.locator('#pwa-guide-steps').innerText(),/Safariの共有ボタン/);
   await page.screenshot({path:path.join(__dirname,`../preview/pwa/${device}-guide.png`)});
   await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>qaRun.phase),'title');
   // Enter closes focused dialog button but never starts the game underneath.
   await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>qaRun.phase),'title');
   if(await page.locator('#pwa-guide').evaluate(el=>el.open))await click('pwa-guide-close');
   await page.screenshot({path:path.join(__dirname,`../preview/pwa/${device}-title.png`)});
  }
  if(device==='android'){
   await page.evaluate(()=>{const event=new Event('beforeinstallprompt');event.prompt=async()=>window.promptCalls=(window.promptCalls||0)+1;event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);});
   await click('pwa-install');assert.equal(await page.evaluate(()=>window.promptCalls),1);
   assert.equal(await page.locator('#pwa-install').isVisible(),true);
   await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));assert.equal(await page.locator('#pwa-install').isVisible(),false);
  }
  if(device==='pc'){
   await page.evaluate(async()=>{await navigator.serviceWorker.ready;await caches.open('ichinen8-cache-v0');await caches.open('another-app');});
   await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller&& !document.getElementById('title-start').disabled);
   const manifest=await page.evaluate(async()=>await(await fetch('manifest.webmanifest')).json());assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,2);
   // Activate code is separately unit-tested; cached game and storage work offline.
   await page.evaluate(()=>localStorage.setItem('ichinen8_endings_seen','["1","2","3"]'));
   await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!document.getElementById('title-start').disabled);
   assert.equal(await page.locator('#title-memory').innerText(),'記憶 3/7');await context.setOffline(false);
  }
  await click('title-start');await page.waitForFunction(()=>qaRun.phase==='corridor');
  assert.equal(await page.locator('#pwa-install').isVisible(),false);
  const x=await page.evaluate(()=>qaRun.travelX);
  if(touch){await page.locator('#right-button').dispatchEvent('pointerdown',{pointerId:1});await page.waitForTimeout(200);await page.locator('#right-button').dispatchEvent('pointerup',{pointerId:1});}
  else{await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);await page.keyboard.up('ArrowRight');}
  assert.ok(await page.evaluate(()=>qaRun.travelX)>x);assert.deepEqual(errors,[]);
  console.log('PASS PWA '+device+': title, install flow, start, controls, storage/offline where applicable');
  await context.close();
 }
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
