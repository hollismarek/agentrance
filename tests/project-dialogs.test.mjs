import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<div id="root"></div>');
const keys=['window','document','IS_REACT_ACT_ENVIRONMENT','ResizeObserver','__projectTest'];
const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
const {createRoot}=await import('react-dom/client');
test.after(()=>{dom.window.close();keys.forEach((key,i)=>{if(old[i])Object.defineProperty(globalThis,key,old[i]);else delete globalThis[key]})});
const out=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`export {NewSessionDialog} from './src/components/NewSessionDialog';export {CompareDialog} from './src/components/CompareDialog';`},bundle:true,platform:'node',format:'cjs',external:['react'],write:false,plugins:[{name:'fake-tauri',setup(build){
 build.onResolve({filter:/^@tauri-apps\//},args=>({path:args.path,namespace:'fake-tauri'}));
 build.onLoad({filter:/.*/,namespace:'fake-tauri'},()=>({contents:`export const invoke=(...args)=>globalThis.__projectTest.invoke(...args);export const open=(...args)=>globalThis.__projectTest.open(...args);`}));
}}]});
const module={exports:{}};
new Function('require','module','exports',out.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const provider={id:'one',name:'First provider',cwd:'/default'};
test.beforeEach(()=>{globalThis.__projectTest={invoke:async(command,{path})=>{assert.equal(command,'validate_project');return path},open:async()=>null}});
async function type(element,text){
 await act(async()=>{
  const prototype=element.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,text);
  element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 });
}
test('new session shows a full project path and requires an absolute selection before starting',async()=>{
 const root=createRoot(document.getElementById('root'));const started=[];
 try{
  await act(async()=>root.render(React.createElement(module.exports.NewSessionDialog,{provider,initialProject:'/recent',projects:['/recent','/another'],onClose(){},onStart:path=>started.push(path)})));
  assert.equal(document.querySelector('[aria-label="Project folder"]').value,'/recent');
  assert.equal(document.querySelectorAll('datalist option').length,2);
  await type(document.querySelector('input'),'relative');
  assert.equal(document.querySelector('button.primary').disabled,true);
  await type(document.querySelector('input'),'/chosen project');
  await act(async()=>document.querySelector('button.primary').click());
  assert.deepEqual(started,['/chosen project']);assert.equal(provider.cwd,'/default');
 }finally{await act(async()=>root.unmount())}
});
test('native Browse selects a folder and cancellation preserves the current selection',async()=>{
 const root=createRoot(document.getElementById('root'));const options=[];
 let choice='/picked folder';
 globalThis.__projectTest.open=async opts=>{options.push(opts);return choice};
 try{
  await act(async()=>root.render(React.createElement(module.exports.NewSessionDialog,{provider,initialProject:'/default',projects:[],onClose(){},onStart(){}})));
  const browse=()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Browse…');
  await act(async()=>browse().click());
  assert.equal(document.querySelector('input').value,'/picked folder');
  assert.deepEqual(options[0],{directory:true,multiple:false,title:'Choose project folder'});
  choice=null;await act(async()=>browse().click());
  assert.equal(document.querySelector('input').value,'/picked folder');
 }finally{await act(async()=>root.unmount())}
});
test('a missing project keeps Compare open with its prompt and attachments for correction',async()=>{
 const root=createRoot(document.getElementById('root'));const sent=[];
 globalThis.__projectTest.invoke=async()=>{throw Error('Project folder no longer exists')};
 try{
  await act(async()=>root.render(React.createElement(module.exports.CompareDialog,{providers:[provider],initialProject:'/missing',onClose(){},onCompare:(...args)=>sent.push(args)})));
  await type(document.querySelector('textarea'),'Keep this review prompt');
  const input=document.querySelector('input[type="file"]');
  Object.defineProperty(input,'files',{value:[{name:'notes.txt',size:2,type:'text/plain',arrayBuffer:async()=>new TextEncoder().encode('hi').buffer}]});
  await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
  await act(async()=>document.querySelector('button.primary').click());
  assert.deepEqual(sent,[]);
  assert.equal(document.querySelector('textarea').value,'Keep this review prompt');
  assert.ok(document.querySelector('[aria-label="Remove notes.txt"]'));
  assert.match(document.querySelector('[role="alert"]').textContent,/no longer exists/);
  globalThis.__projectTest.invoke=async(command,{path})=>path;
  await type(document.querySelector('[aria-label="Project folder"]'),'/valid');
  await act(async()=>document.querySelector('button.primary').click());
  assert.equal(sent.length,1);assert.equal(sent[0][0],'Keep this review prompt');
  assert.equal(sent[0][1][0].name,'notes.txt');assert.equal(sent[0][2],'/valid');
 }finally{await act(async()=>root.unmount())}
});
test('Compare sends one explicitly chosen project with the prompt for every provider',async()=>{
 const root=createRoot(document.getElementById('root'));const sent=[];
 try{
  await act(async()=>root.render(React.createElement(module.exports.CompareDialog,{providers:[provider,{...provider,id:'two',cwd:'/different'}],onClose(){},onCompare:(...args)=>sent.push(args)})));
  await type(document.querySelector('textarea'),'Review this repository');
  assert.equal(document.querySelector('button.primary').disabled,true);
  await type(document.querySelector('[aria-label="Project folder"]'),'/shared project');
  assert.equal(document.querySelector('button.primary').disabled,false);
  await act(async()=>document.querySelector('button.primary').click());
  assert.deepEqual(sent,[['Review this repository',[],'/shared project']]);
  assert.match(document.body.textContent,/Every provider will use this same project folder/);
 }finally{await act(async()=>root.unmount())}
});
