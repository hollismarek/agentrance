import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
const out=await build({entryPoints:['src/components/CloseRecoveryDialog.tsx'],bundle:true,platform:'node',format:'cjs',external:['react','react-dom'],write:false});
const module={exports:{}};new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
test('quit-save failures appear outside open dialogs with accessible recovery actions',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),keys=['window','document','IS_REACT_ACT_ENVIRONMENT'];
 const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')),actions=[];
 function Harness(){
  const [error,setError]=useState('');
  return React.createElement(React.Fragment,null,
   React.createElement('div',{className:'app',inert:!!error},React.createElement('div',{className:'overlay settings-overlay',role:'dialog'},'Settings remains open',React.createElement('button',{onClick:()=>setError('Disk full; window kept open')},'Simulate quit'))),
   React.createElement(module.exports.CloseRecoveryDialog,{saving:false,error,onRetry:()=>actions.push('retry'),onKeepWorking:()=>{actions.push('work');setError('')},onQuit:()=>actions.push('quit')}));
 }
 try{
  await act(async()=>root.render(React.createElement(Harness)));
  const open=document.querySelector('.settings-overlay button');open.focus();
  await act(async()=>open.click());
  const dialog=document.querySelector('[role="alertdialog"]');
  assert.ok(dialog);assert.equal(dialog.closest('.app'),null);
  assert.equal(dialog.parentElement.parentElement,document.body);
  assert.equal(document.querySelector('.app').hasAttribute('inert'),true);
  assert.equal(dialog.getAttribute('aria-modal'),'true');
  const buttons=dialog.querySelectorAll('button');assert.equal(buttons.length,3);
  assert.equal(document.activeElement,buttons[0]);
  await act(async()=>buttons[0].click());assert.deepEqual(actions,['retry']);
  await act(async()=>buttons[2].click());assert.deepEqual(actions,['retry','quit']);
  await act(async()=>buttons[1].click());
  assert.equal(document.querySelector('[role="alertdialog"]'),null);
  assert.match(document.querySelector('.settings-overlay').textContent,/Settings remains open/);
  assert.equal(document.querySelector('.app').hasAttribute('inert'),false);assert.equal(document.activeElement,open);
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  keys.forEach((key,i)=>{if(old[i])Object.defineProperty(globalThis,key,old[i]);else delete globalThis[key]});
 }
});
