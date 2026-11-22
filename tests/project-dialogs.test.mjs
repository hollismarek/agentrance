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
const out=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`export {ProviderSessionsDialog} from './src/components/ProviderSessionsDialog';export {BackupDialog} from './src/components/BackupDialog';export {NewSessionDialog} from './src/components/NewSessionDialog';export {CompareDialog} from './src/components/CompareDialog';`},bundle:true,platform:'node',format:'cjs',external:['react'],write:false,plugins:[{name:'fake-tauri',setup(build){
 build.onResolve({filter:/^@tauri-apps\//},args=>({path:args.path,namespace:'fake-tauri'}));
 build.onLoad({filter:/.*/,namespace:'fake-tauri'},()=>({contents:`export const invoke=(...args)=>globalThis.__projectTest.invoke(...args);export const open=(...args)=>globalThis.__projectTest.open(...args);export const save=(...args)=>globalThis.__projectTest.save(...args);`}));
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
  assert.deepEqual(sent,[['Review this repository',[],'/shared project',[provider,{...provider,id:'two',cwd:'/different'}]]]);
  assert.match(document.body.textContent,/Every provider will use this same project folder/);
 }finally{await act(async()=>root.unmount())}
});

test('Compare routes prompts to only the chosen providers or available existing sessions',async()=>{
 const root=createRoot(document.getElementById('root'));
 const sent=[],existing=[],validated=[];
 const sessions=[
  {id:'one',title:'First review',provider:'Kiro',cwd:'/one',live:true,busy:false},
  {id:'two',title:'Second review',provider:'Codex',cwd:'/two',live:true,busy:false},
  {id:'busy',title:'Busy review',provider:'Codex',cwd:'/two',live:true,busy:true},
  {id:'offline',title:'Saved review',provider:'Kiro',cwd:'/one',live:false,busy:false},
 ];
 globalThis.__projectTest.invoke=async(command,{path})=>{validated.push(command);return path};
 async function mode(value){
  const select=document.querySelector('.compare-mode select');
  await act(async()=>{select.value=value;select.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
 }
 const groups=()=>[...document.querySelectorAll('.compare-targets input')];
 const send=()=>document.querySelector('button.primary');
 try{
  await act(async()=>root.render(React.createElement(module.exports.CompareDialog,{
   providers:[provider,{...provider,id:'another',name:'Another provider'}],sessions,initialProject:'/new',
   onClose(){},onCompare:(...args)=>sent.push(args),onExisting:(...args)=>existing.push(args),
  })));
  await type(document.querySelector('textarea'),'Review the changes');
  await mode('selected');
  assert.equal(send().disabled,true);
  await act(async()=>groups()[1].click());
  await act(async()=>send().click());
  assert.deepEqual(sent.map(args=>args[3].map(p=>p.id)),[['another']]);
  await mode('existing');
  assert.equal(document.querySelector('[aria-label="Project folder"]'),null);
  assert.equal(send().disabled,true);
  assert.deepEqual(groups().map(input=>input.disabled),[false,false,false,true,true]);
  await act(async()=>groups()[2].click());
  await act(async()=>send().click());
  await act(async()=>groups()[0].click());
  await act(async()=>send().click());
  assert.deepEqual(existing,[['Review the changes',[],['two']],['Review the changes',[],['one','two']]]);
  await act(async()=>root.render(React.createElement(module.exports.CompareDialog,{
   providers:[provider],sessions:sessions.map(session=>session.id==='two'?{...session,live:false}:session),
   onClose(){},onCompare(){},onExisting:(...args)=>existing.push(args),
  })));
  assert.equal(groups()[2].checked,true);
  assert.equal(groups()[2].disabled,false);
  assert.equal(send().disabled,true);
  await act(async()=>document.querySelector('textarea').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
  assert.equal(existing.length,2);
  await act(async()=>groups()[2].click());
  await act(async()=>send().click());
  assert.deepEqual(existing.at(-1),['Review the changes',[],['one']]);
  assert.deepEqual(validated,['validate_project']);
 }finally{await act(async()=>root.unmount())}
});

test('backup flushes workspace before export and restore requires explicit confirmation',async()=>{
 const root=createRoot(document.getElementById('root'));
 const calls=[];
 Object.assign(globalThis.__projectTest,{
  invoke:async(command,args)=>{
   calls.push([command,args]);
  },
  save:async()=>'/backup-new.zip',
  open:async()=>'/backup-existing.zip',
 });
 async function click(label){
  const button=[...document.querySelectorAll('button')].find(node=>node.textContent===label);
  assert.ok(button,label);
  assert.equal(button.disabled,false);
  await act(async()=>button.click());
 }
 try{
  await act(async()=>root.render(React.createElement(module.exports.BackupDialog,{
   onClose(){},profile:{pending:false,hasPrevious:false},onStaged(){},flushWorkspace:async()=>{calls.push(['flush'])},
  })));
  await click('Create backup…');
  assert.deepEqual(calls,[['flush'],['create_backup',{destination:'/backup-new.zip'}]]);
  await click('Restore backup…');
  assert.match(document.body.textContent,/backup-existing\.zip/);
  assert.equal(calls.length,2);
  await click('Cancel');
  assert.equal(calls.length,2);
  await click('Restore backup…');
  await click('Restore on next launch');
  assert.deepEqual(calls.at(-1),['stage_backup_restore',{archive:'/backup-existing.zip'}]);
  await act(async()=>root.render(React.createElement(module.exports.BackupDialog,{
   onClose(){},profile:{pending:true,hasPrevious:false},onStaged(){},flushWorkspace:async()=>{},
  })));
  assert.match(document.body.textContent,/Quit and reopen Agentrance/);
 }finally{await act(async()=>root.unmount())}
});

test('provider session picker pages through the project and opens only the selected chat',async()=>{
 const root=createRoot(document.getElementById('root'));
 const calls=[],opened=[];
 globalThis.__projectTest.invoke=async(command,args)=>{
  calls.push([command,args]);
  return args.cursor?
   {sessions:[{sessionId:'second',title:'Second chat'}],nextCursor:null}:
   {sessions:[{sessionId:'first',title:'First chat'}],nextCursor:'more'};
 };
 const click=label=>act(async()=>{
  const button=[...document.querySelectorAll('button')].find(node=>node.textContent===label);
  assert.ok(button,label);
  button.click();
 });
 try{
  await act(async()=>root.render(React.createElement(module.exports.ProviderSessionsDialog,{
   providers:[provider],selected:provider.id,projects:[],onClose(){},
   onOpen:async(...args)=>{opened.push(args)},
  })));
  await type(document.querySelector('[aria-label="Project folder"]'),'/original');
  await click('Find sessions');
  await click('Load more sessions');
  assert.deepEqual(calls,[
   ['list_provider_sessions',{provider:{...provider,cwd:'/original'},cursor:undefined}],
   ['list_provider_sessions',{provider:{...provider,cwd:'/original'},cursor:'more'}],
  ]);
  assert.equal(opened.length,0);
  await click('Second chat');
  assert.deepEqual(opened,[[{...provider,cwd:'/original'},'second','Second chat']]);
 }finally{await act(async()=>root.unmount())}
});
