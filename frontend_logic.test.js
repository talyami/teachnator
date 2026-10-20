'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const h = require('./frontend/domain/questions.cjs');
const study = require('./frontend/domain/study.cjs');
const timer = require('./frontend/domain/timer.cjs');
const { createProgressWriter } = require('./frontend/services/progress.cjs');
const { diagnosticPayload } = require('./frontend/services/diagnostics.cjs');
const { revokeThenClear } = require('./frontend/services/auth.cjs');
const { createByteCache, readBoundedJson, withBitmap, playHtmlAudio, installOneTimeUnlock } = require('./frontend/services/resources.cjs');
const workspace = require('./frontend/services/workspace.cjs');
const q = (id = 'q1', type = 'mcq') => h.normalizeQuestion(type === 'short_answer' ? { id, type, text: 'What?', expectedAnswer: 'water' } : { id, text: 'Question?', options: ['a','b'], correct: 0 });
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const scope = { owner: 'account:1', materialId: 7, mode: 'quiz', runId: 'r1', token: 't1' };
test('reject malformed questions and repair duplicate bank IDs, preserving review identity', () => {
  for (const input of [null, [], 'bad', { text: {} }, {text:'Q',options:['a',{}],correct:0}, {text:'Q',options:['a','b'],correct:8}, {text:'Q',type:'short_answer'}]) assert.equal(h.normalizeQuestion(input), null);
  const bank = h.normalizeQuestions([q(), {...q(), text:'Another?'}, {...q(), isReviewQueue:true}]);
  assert.equal(new Set(bank.slice(0,2).map(x=>x.id)).size, 2);
  assert.equal(bank[2].id, bank[0].id);
  assert.equal(h.normalizeQuestion(q()).id,q().id);
});
test('cloze uses explicit one-based occurrence or exact start and rejects ambiguous repeats', () => {
  const base = { type:'fill_blank', text:'red then red', missingWord:'red', options:['red','blue'] };
  assert.equal(h.normalizeQuestion(base),null);
  assert.equal(h.normalizeQuestion({...base,clozeOccurrence:2}).clozeText,'red then [_____]');
  assert.equal(h.normalizeQuestion({...base,missingWordStart:0}).clozeText,'[_____] then red');
  assert.equal(h.normalizeQuestion({...base,clozeText:'red then [_____]'}).missingWordStart,9);
  assert.equal(h.normalizeQuestion({...base,missingWordStart:1}),null);
  assert.doesNotMatch(h.getSpokenQuestionText(h.normalizeQuestion({...base,clozeOccurrence:2})), /then red/);
});
test('local lexical grading conservatively preserves Arabic and English negation', () => {
  for (const [expected, student] of [['photosynthesis','photo'],['red green blue','red red red'],['red','red not red'],['','anything'],['الماء لا يغلي','الماء يغلي'],['الماء لم يغلي','الماء يغلي'],['لا يذوب الملح','يذوب لا الملح'],['water does not boil','water does boil'],['is not red','red is not'],["water isn't red",'water is red']]) assert.equal(h.localEvaluateShortAnswer(expected,student).isCorrect,false,`${expected} / ${student}`);
  assert.equal(h.localEvaluateShortAnswer('red green blue','blue red green').isCorrect,true);
  assert.equal(h.localEvaluateShortAnswer('الماء لا يغلي','الماء لا يغلي').isCorrect,true);
});
test('all answer types share wrong requeue and explicit post-answer checkpoint', () => {
  for(const type of ['mcq','short_answer']) {
    let run=study.createRun({...scope,materialKey:7,questions:[q('q',type)],mode:'quiz',now:100});
    const old=run;
    run=study.answerTransition(run,false);
    assert.equal(old.queue.length,1); assert.equal(run.queue.length,2); assert.equal(run.completed,false);
    assert.equal(run.currentIndex,1); assert.equal(run.wrongQuestions.length,1); assert.equal(run.queue[1].id,run.queue[0].id);
    assert.equal(study.checkpoint(run,200).state.currentIndex,1);
    run=study.answerTransition(run,true);
    assert.equal(run.completed,true); assert.equal(run.score,1); assert.equal(run.timer.running,false);
    assert.equal(study.checkpoint(run,300).isCompleted,1);
  }
});
test('fresh/restart/result-mode runs reset queues, timer, score, and streak with isolated run IDs', () => {
  const run=study.createRun({owner:'guest',materialKey:'g',mode:'learn',questions:[q()],now:100,runId:'old'});
  const needsReview=study.learnTransition(run,false);
  assert.equal(needsReview.queue.length,2); assert.equal(needsReview.currentIndex,1);
  for(const mode of ['learn','quiz']) {
    const fresh=study.createRun({owner:'guest',materialKey:'g',mode,questions:[q()],now:1000});
    assert.notEqual(fresh.runId,run.runId); assert.equal(fresh.score,0); assert.equal(fresh.wrongQuestions.length,0);
    assert.equal(fresh.timer.remainingMs,900000); assert.equal(study.checkpoint(fresh,1000).mode,mode);
  }
});
test('elapsed timer survives delayed ticks and pauses, resets, extends, resumes with scope', () => {
  let t=timer.createTimer({owner:'a',materialKey:7,mode:'quiz',runId:'r',running:true,now:1000,remainingMs:10000});
  assert.equal(timer.remainingMs(t,6500),4500);
  t=timer.updateTimer(t,{running:false,now:6500}); assert.equal(timer.remainingMs(t,999999),4500);
  t=timer.updateTimer(t,{extendMs:300000,now:9000}); assert.equal(t.remainingMs,304500);
  t=timer.updateTimer(t,{running:true,now:10000}); assert.equal(timer.remainingMs(t,11500),303000);
  const local={...t,updatedAt:12000,remainingMs:300000}; assert.equal(timer.reconcileTimer(t,local),local);
  for(const key of ['owner','materialKey','mode','runId']) assert.equal(timer.reconcileTimer(t,{...local,[key]:'different'}),t);
  assert.notEqual(timer.timerKey(t),timer.timerKey({...t,mode:'learn'}));
});
test('progress serializes writes and advances optimistic revision; snapshots are detached', async () => {
  const first=deferred(); const posts=[]; let revision=3;
  const writer=createProgressWriter({get:async()=>({revision,progress:{}}),post:async(s,body)=>{posts.push(body);if(posts.length===1)await first.promise;return{revision:++revision};}});
  await writer.load(scope);
  const body={state:{score:1},materialId:7,mode:'quiz'};
  const one=writer.enqueue(scope,body); body.state.score=99;
  const two=writer.enqueue(scope,{state:{score:2}});
  await Promise.resolve(); assert.equal(posts.length,1); assert.equal(posts[0].state.score,1); assert.equal(posts[0].expectedRevision,3);
  first.resolve(); await Promise.all([one,two]); assert.equal(posts[1].expectedRevision,4);
});
test('409 and unknown existing progress stop writes without a blind overwrite', async () => {
  let posts=0,conflicts=0;
  const writer=createProgressWriter({get:async()=>({revision:2,progress:{}}),post:async()=>{posts++;throw Object.assign(new Error('secret'),{status:409});},onConflict:()=>conflicts++});
  await writer.enqueue(scope,{state:{}}); assert.equal(posts,0); assert.equal(conflicts,1);
  await writer.load(scope); await writer.enqueue(scope,{state:{}}); await writer.enqueue(scope,{state:{}});
  assert.equal(posts,1);assert.equal(conflicts,3);
});
test('owner/material/mode/run isolation skips superseded queued saves', async () => {
  let current=true;const calls=[];
  const writer=createProgressWriter({get:async()=>({revision:0,progress:null}),post:async(s,b)=>{calls.push([s,b]);return{revision:1};},isCurrent:()=>current});
  const old=writer.enqueue(scope,{state:{runId:'old'}});
  const latest=writer.enqueue({...scope,runId:'new'},{state:{runId:'new'}});
  await Promise.all([old,latest]);assert.equal(calls.length,1);assert.equal(calls[0][0].runId,'new');
  current=false;await writer.enqueue({...scope,mode:'learn'},{state:{}});assert.equal(calls.length,1);
});
test('a newer material invalidates pending writes and an out-of-order progress load', async () => {
  const gate=deferred(); const calls=[]; const loads=[];
  const writer=createProgressWriter({get:async s=>{loads.push(s.materialId);if(s.materialId===7)await gate.promise;return{revision:0,progress:null};},post:async(s,b)=>{calls.push([s,b]);return{revision:1};}});
  const first=writer.load(scope); await Promise.resolve(); await Promise.resolve();
  const second=writer.load({...scope,materialId:8}); await second; gate.resolve(); assert.equal(await first,null);
  const old=writer.enqueue(scope,{state:{}});const next=writer.enqueue({...scope,materialId:8},{state:{}});
  await Promise.all([old,next]);assert.deepEqual(calls.map(([s])=>s.materialId),[8]);assert.deepEqual(loads,[7,8]);
});
test('a superseded in-flight conflict blocks the replacement run without stale run callbacks or writes', async () => {
  const gate=deferred();const conflicts=[];let posts=0;
  const writer=createProgressWriter({get:async()=>({revision:0,progress:null}),post:async()=>{posts++;await gate.promise;throw Object.assign(new Error('old'),{status:409});},onConflict:s=>conflicts.push(s.runId)});
  await writer.load(scope);const first=writer.enqueue(scope,{});await Promise.resolve();
  const second=writer.enqueue({...scope,runId:'replacement'},{});gate.resolve();await Promise.all([first,second]);assert.deepEqual(conflicts,['replacement']);assert.equal(posts,1);
});
test('restore rejects owner/material/mode cross-scope snapshots and preserves valid review identity', () => {
  const run=study.answerTransition(study.createRun({owner:'guest',materialKey:'g',mode:'quiz',questions:[q()],now:100}),false);
  const progress={state:study.checkpoint(run,100).state};
  const restored=study.restoreRun({owner:'guest',materialKey:'g',mode:'quiz',questions:[q()],progress,now:200});
  assert.equal(restored.runId,run.runId);assert.equal(restored.currentIndex,1);assert.equal(restored.queue[1].id,restored.queue[0].id);
  for(const overrides of [{owner:'account:2'},{materialKey:'other'},{mode:'learn'}]) {
    const fresh=study.restoreRun({owner:'guest',materialKey:'g',mode:'quiz',questions:[q()],progress,now:200,...overrides});
    assert.notEqual(fresh.runId,run.runId);assert.equal(fresh.currentIndex,0);
  }
});
test('logout awaits revocation and cannot erase a newer account', async () => {
  const gate=deferred();const events=[];let current='a';
  const logout=revokeThenClear({token:'a',revoke:async()=>{events.push('post');await gate.promise;events.push('revoked');},isCurrent:t=>current===t,clear:()=>events.push('clear')});
  assert.deepEqual(events,['post']);current='b';gate.resolve();assert.equal(await logout,false);assert.deepEqual(events,['post','revoked']);
  await revokeThenClear({token:'b',revoke:async()=>events.push('post-b'),isCurrent:t=>current===t,clear:()=>events.push('clear-b')});assert.equal(events.at(-1),'clear-b');
});
test('guest reset retains archive but leaves upload workspace inactive until manual resume', () => {
  const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};const archive={generationId:'g'};
  values.set('archive',JSON.stringify(archive));workspace.deactivateGuestWorkspace(storage);
  assert.equal(workspace.guestWorkspaceActive(storage,archive),false);assert.equal(values.has('archive'),true);
  workspace.activateGuestWorkspace(storage,'g');assert.equal(workspace.guestWorkspaceActive(storage,archive),true);
});
test('image bitmap closes on early return and thrown conversion; audio rejection revokes URL once', async () => {
  let closed=0;const bitmap={close:()=>closed++};assert.equal(await withBitmap({},async()=>bitmap,async()=>7),7);
  await assert.rejects(withBitmap({},async()=>bitmap,async()=>{throw new Error('canvas failed');}));assert.equal(closed,2);
  const revoked=[];const audio={play:async()=>{throw new Error('gesture');},pause(){}};
  assert.equal(await playHtmlAudio({audio,url:'blob:x',revoke:u=>revoked.push(u)}),false);audio.onerror();assert.deepEqual(revoked,['blob:x']);
});
test('audio JSON response is byte-bounded while streaming and releases its reader', async () => {
  const chunk=new TextEncoder().encode('{"audio":"large"}');let cancelled=0,released=0,index=0;
  const response={headers:{get:()=>null},body:{getReader:()=>({read:async()=>index++?{done:true}:{done:false,value:chunk},cancel:async()=>cancelled++,releaseLock:()=>released++})}};
  await assert.rejects(readBoundedJson(response,8),e=>e.code==='AUDIO_RESPONSE_TOO_LARGE');assert.equal(cancelled,1);assert.equal(released,1);
  index=0;assert.deepEqual(await readBoundedJson(response,100),{audio:'large'});assert.equal(released,2);
});
test('audio cache enforces byte and item budgets; unlock removes every listener together', () => {
  const cache=createByteCache(100,2);cache.set('a',{data:'a'.repeat(20)});cache.set('b',{data:'b'.repeat(20)});cache.set('c',{data:'c'.repeat(20)});
  assert.equal(cache.get('a'),undefined);assert.equal(cache.bytes,80);assert.equal(cache.set('huge',{data:'x'.repeat(51)}),false);
  cache.clear();assert.equal(cache.bytes,0);
  const listeners=new Map();let unlocked=0;installOneTimeUnlock({addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)},()=>unlocked++);
  listeners.get('pointerdown')();assert.equal(listeners.size,0);assert.equal(unlocked,1);
});
test('diagnostics sends only allowlisted code, known app asset basename, and bounded line', () => {
  const report=diagnosticPayload('runtime_error','https://example.test/assets/app-0123456789abcdef.js?token=SECRET',42);
  assert.deepEqual(report,{code:'CLIENT_RUNTIME_ERROR',asset:'app-0123456789abcdef.js',line:42});
  assert.equal(diagnosticPayload('arbitrary content'),null);
  assert.deepEqual(diagnosticPayload('render_failed','https://secret.test/content/lesson.js',999),{code:'CLIENT_RENDER_ERROR',asset:'',line:0});
  assert.equal(JSON.stringify(report).includes('SECRET'),false);
});
test('mounted run hook pauses modal time, resumes, resets per mode, and checkpoints explicit snapshots', async () => {
  const {JSDOM}=require('jsdom');const React=require('react');
  const previous={window:global.window,document:global.document,localStorage:global.localStorage,sessionStorage:global.sessionStorage,act:global.IS_REACT_ACT_ENVIRONMENT};
  const dom=new JSDOM('<div id="test-root"></div>',{url:'https://example.test/teachnator/'});
  Object.assign(global,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
  const originalNow=Date.now;let now=10000;Date.now=()=>now;
  let current;const applied=[];const identityRef={current:''};const {useStudySession}=frontendModule();
  const {createRoot}=require('react-dom/client');
  const root=createRoot(document.getElementById('test-root'));
  function Harness({paused}) { current=useStudySession({owner:'guest',token:'',identityRef,paused,onApply:r=>applied.push(r),onConflict:()=>{},onError:()=>{}});return null; }
  try {
    await React.act(async()=>root.render(React.createElement(Harness,{paused:false})));
    await React.act(async()=>current.fresh('learn',[q()],[q()],'guest-material'));
    const first=current.runRef.current;assert.equal(current.seconds,900);assert.equal(current.running,true);
    now+=5500;await React.act(async()=>root.render(React.createElement(Harness,{paused:true})));
    assert.equal(current.seconds,895);assert.equal(current.running,false);
    now+=60000;await React.act(async()=>root.render(React.createElement(Harness,{paused:false})));
    assert.equal(current.seconds,895);assert.equal(current.running,true);
    await React.act(async()=>current.changeTimer({running:false}));now+=10000;
    assert.equal(timer.remainingMs(current.runRef.current.timer),894500);
    await React.act(async()=>current.changeTimer({extendMs:300000,running:true}));assert.equal(current.seconds,1195);
    await React.act(async()=>current.fresh('quiz',[q()],[q()],'guest-material'));
    assert.notEqual(current.runRef.current.runId,first.runId);assert.equal(current.seconds,900);
    await React.act(async()=>current.hold(study.answerTransition(current.runRef.current,false)));
    assert.equal(current.runRef.current.currentIndex,1);assert.equal(current.runRef.current.queue.length,2);assert.equal(applied.at(-1).currentIndex,0);
    const key=timer.timerKey(current.runRef.current.timer);assert.ok(localStorage.getItem(key));
    await React.act(async()=>current.clear());assert.equal(current.runRef.current,null);assert.equal(current.running,false);assert.equal(current.seconds,900);
  } finally {
    await React.act(async()=>root.unmount());dom.window.close();Date.now=originalNow;
    Object.assign(global,{window:previous.window,document:previous.document,localStorage:previous.localStorage,sessionStorage:previous.sessionStorage,IS_REACT_ACT_ENVIRONMENT:previous.act});
  }
});
test('rendered app exposes base-aware policy links from an inactive guest workspace', async () => {
  const {JSDOM}=require('jsdom');const React=require('react');
  const previous={window:global.window,document:global.document,localStorage:global.localStorage,sessionStorage:global.sessionStorage,fetch:global.fetch,raf:global.requestAnimationFrame,act:global.IS_REACT_ACT_ENVIRONMENT};
  const dom=new JSDOM('<div id="test-root"></div>',{url:'https://example.test/teachnator/'});
  const response=body=>({ok:true,json:async()=>body,headers:{get:()=>null}});
  const fakeFetch=async url=>response(String(url).includes('/version')?{version:require('./release.cjs').version,build:require('./release.cjs').build}:String(url).includes('/config')?{supportEmail:'support@example.test'}:String(url).includes('/material-quota')?{success:true,quota:{canGenerate:false,remaining:0}}:{success:true,packs:[]});
  Object.assign(global,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,fetch:fakeFetch,requestAnimationFrame:fn=>{fn();return 1;},IS_REACT_ACT_ENVIRONMENT:true});
  window.fetch=fakeFetch;localStorage.setItem('fl_ui_language','en');
  const archive={owner:'guest',generationId:'archive',mode:'intro',playerName:'Student',questionsData:[q()],allOriginalQuestions:[q()]};
  localStorage.setItem('smartExamGuestMaterial.v1',JSON.stringify(archive));workspace.deactivateGuestWorkspace(localStorage);
  const {createRoot}=require('react-dom/client');
  const root=createRoot(document.getElementById('test-root'));
  try {
    const {App}=frontendModule();await React.act(async()=>root.render(React.createElement(App)));
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Paste text'));assert.ok(button);
    // Typing/focus is exercised in frontend_runtime.test.js, where ReactDOM is
    // initialized inside the same browser realm. This Node-loaded ReactDOM
    // instance has cached feature detection from the preceding hook-only test.
    for(const page of ['privacy','terms','contact']) assert.ok(document.querySelector(`a[href="/teachnator/${page}"]`));
    for(const b of document.querySelectorAll('button')) assert.ok((b.getAttribute('aria-label')||b.textContent).trim(),b.outerHTML);
  } finally {
    await React.act(async()=>root.unmount());dom.window.close();
    Object.assign(global,{window:previous.window,document:previous.document,localStorage:previous.localStorage,sessionStorage:previous.sessionStorage,fetch:previous.fetch,requestAnimationFrame:previous.raf,IS_REACT_ACT_ENVIRONMENT:previous.act});
  }
});
function frontendModule() {
  const output=require('esbuild').buildSync({stdin:{contents:"export {default as App} from './frontend/App.jsx'; export * from './frontend/views/index.jsx'; export { useStudySession } from './frontend/services/useStudySession.js';",resolveDir:__dirname,loader:'jsx'},bundle:true,write:false,format:'cjs',platform:'node',external:['react','react-dom/server'],logLevel:'silent'}).outputFiles[0].text;
  const compiled=new Module(path.join(__dirname,'frontend-test.cjs'),module);compiled.filename=path.join(__dirname,'frontend-test.cjs');compiled.paths=Module._nodeModulePaths(__dirname);compiled._compile(output,compiled.filename);return compiled.exports;
}
test('JSX import graph renders orchestration and stable module-scope views offline', () => {
  const values=new Map();global.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  global.window={location:{protocol:'https:',hostname:'example.test',pathname:'/',port:''}};
  const {renderToStaticMarkup}=require('react-dom/server');const React=require('react');const graph=frontendModule();
  assert.match(renderToStaticMarkup(React.createElement(graph.App)),/role="status"/);
  const noop=()=>{};const defaultProps=new Proxy({t:k=>String(k),uiError:k=>String(k),questionsData:[q()],shuffledQuestions:[q()],currentIndex:0,wrongQuestions:[],allOriginalQuestions:[q()],selectedFiles:[],adminUsers:[],adminStats:{},adminQuotaEdits:{},adminAiSettings:{server_vertex_config:{}},adminVersionForm:{},adminDbVersion:{},versionSaveMsg:'',aiSettingsSaveMsg:'',googleAuthError:'',speechState:{status:'idle'},isAnswerChecked:false,isEvaluatingShortAnswer:false,isAnswerRevealed:false,showHint:false,isListeningSpeech:false,canGenerateMaterial:false,isProcessingFiles:false,isSavingVersion:false,isSavingAiSettings:false,musicEnabled:true,pinkNoiseEnabled:false,quotaLoading:false,isAllowanceExhausted:false,consecutiveStreak:0,selectedAnswer:null,fillBlankSelected:null,shortAnswerEvaluation:null,generationRef:{current:null},fileInputRef:{current:null},studentShortAnswer:'',uiLanguage:'en',legalTitles:{privacy:'Privacy',terms:'Terms of use',refund:'Refunds',contact:'Contact & support',billing:'Billing & availability'},playerName:'Student',textInput:'',timeLeft:900,score:0,pinkNoiseVolume:0.08,renderSpeakerButton:()=>null,renderMaterialQuota:()=>null,renderLanguageToggle:()=>null,renderAllowanceExhaustedOverlay:()=>null,getFinishSpeechText:()=>'',formatFileSize:()=>'',uploadTab:'file',adminTab:'users'}, {get:(o,k)=>k in o?o[k]:noop});
  const accessibilityFailures=[];
  for(const name of ['UploadView','LearnView','QuizView','ResultView','AdminView','SettingsView']) {
    const keys=fs.readFileSync(path.join(__dirname,'frontend/views',`${name}.jsx`),'utf8').match(/const \{ (.+) \} = props;/)[1].split(', ');
    const props=Object.fromEntries(keys.map(k=>[k,defaultProps[k]]));
    const cloze=h.normalizeQuestion({id:'cloze',type:'fill_blank',text:'red then red',missingWord:'red',clozeOccurrence:2,options:['red','blue']});
    const variants = name === 'LearnView' ? [{}, {isAnswerRevealed:true,showHint:true}, {questionsData:[q('short','short_answer')],isAnswerRevealed:true}, {questionsData:[cloze]}] : name === 'QuizView' ? [{}, {shuffledQuestions:[cloze]}, {shuffledQuestions:[q('short','short_answer')]}, {shuffledQuestions:[q('short','short_answer')],isAnswerChecked:true,shortAnswerEvaluation:h.localEvaluateShortAnswer('water','water'),studentShortAnswer:'water'}] : name === 'AdminView' ? [{}, {adminTab:'ai_settings'}, {adminTab:'ai_settings',adminAiSettings:{server_tts_provider:'vertex',server_vertex_config:{}}}, {adminTab:'version'}, {adminUsers:[{id:1,name:'Student',auth_provider:'google'}]}] : name === 'UploadView' ? [{}, {uploadTab:'text'}, {selectedFiles:[{id:'f',name:'File.pdf',size:100,isPDF:true}],canGenerateMaterial:true}, {guestSavedMaterial:{generationId:'g'}}] : name === 'SettingsView' ? [{}, {pinkNoiseEnabled:true}] : name === 'ResultView' ? [{}, {wrongQuestions:[q()]}] : [{}];
    for(const variant of variants) {
      let markup;
      assert.doesNotThrow(()=>{markup=renderToStaticMarkup(React.createElement(graph[name],{...props,...variant}));},name);
      const dom=new (require('jsdom').JSDOM)(markup);
      for(const button of dom.window.document.querySelectorAll('button')) {
        assert.ok(button.hasAttribute('type'),`${name}: explicit button type`);
        if (!(button.getAttribute('aria-label') || button.textContent).trim()) accessibilityFailures.push(`${name}: ${button.outerHTML}`);
      }
      dom.window.close();
    }
  }
  assert.deepEqual(accessibilityFailures,[]);
});
