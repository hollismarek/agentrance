import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';

const out=await build({entryPoints:['src/components/SessionPane.tsx'],bundle:true,platform:'node',format:'cjs',external:['react'],write:false});
const module={exports:{}};
new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
test('conversation tabs restore independent reading positions and follow new responses only at the bottom',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 const keys=['window','document','IS_REACT_ACT_ENVIRONMENT','ResizeObserver'];
 const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 let height=1000;const viewport=200,offsets=new WeakMap(),observers=[];
 // jsdom does not lay out text; supply scroll geometry while exercising the
 // mounted SessionPane, real scroll handlers, unmounts and resize observers.
 Object.defineProperties(dom.window.HTMLElement.prototype,{
  scrollHeight:{configurable:true,get(){return height}},
  clientHeight:{configurable:true,get(){return viewport}},
  scrollTop:{configurable:true,get(){return offsets.get(this)??0},set(top){offsets.set(this,Math.max(0,Math.min(top,height-viewport)))}}
 });
 class Observer{
  constructor(callback){this.callback=callback;this.active=true;observers.push(this)}
  observe(){}disconnect(){this.active=false}
 }
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:Observer});
 const root=createRoot(document.getElementById('root')),positions=new Map();
 async function show(id,answer='Answer'){
  await act(async()=>root.render(React.createElement(module.exports.SessionPane,{key:id,scrollPositions:positions,
   session:{id,provider:'Test',cwd:'/project',live:false,busy:false,items:[{kind:'user',data:'Question'},{kind:'delta',data:answer},{kind:'done',data:null}]},
   onHelp(){},onModel(){},onAgent(){},onPermission:async()=>{},onCancel(){},onResume(){},resumeAvailable:false
  })));
  return document.querySelector('.messages');
 }
 async function scroll(top){
  await act(async()=>{const body=document.querySelector('.messages');body.scrollTop=top;body.dispatchEvent(new dom.window.Event('scroll',{bubbles:true}))});
 }
 try{
  assert.equal((await show('a')).scrollTop,800,'first view starts at the latest response');
  await scroll(120);
  assert.equal((await show('b')).scrollTop,800);
  await scroll(400);
  assert.equal((await show('a')).scrollTop,120,'switching back restores the reading position');
  height=1400;
  assert.equal((await show('a','Longer streamed answer')).scrollTop,120,'streaming does not pull a reader to the bottom');
  assert.equal((await show('b')).scrollTop,400,'each conversation has its own position');
  await scroll(1200);
  height=1600;
  assert.equal((await show('b','More response text')).scrollTop,1400,'a reader at the bottom follows new content');
  height=1800;
  await act(async()=>{for(const observer of observers)if(observer.active)observer.callback()});
  assert.equal(document.querySelector('.messages').scrollTop,1600,'resize keeps the latest response in view');
  assert.equal((await show('a')).scrollTop,120,'other tabs retain their older reading positions');
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  keys.forEach((key,i)=>{if(old[i])Object.defineProperty(globalThis,key,old[i]);else delete globalThis[key]});
 }
});
