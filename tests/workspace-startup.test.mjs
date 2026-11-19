import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';

const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useReducer,useState} from 'react';
 import {useSessions} from './src/useSessions';
 import {useWorkspaceRecovery} from './src/useWorkspaceRecovery';
 import {initialWorkspace,workspaceReducer} from './src/workspace';
 export function Harness(){
  const [workspace,dispatch]=useReducer(workspaceReducer,initialWorkspace);
  const [drafts,setDrafts]=useState({});
  const desk=useSessions(globalThis.__recoveryTest.error);
  const recovery=useWorkspaceRecovery(workspace,drafts,dispatch,setDrafts,desk.restore,globalThis.__recoveryTest.error);
  globalThis.__recoveryTest.state={workspace,drafts,sessions:desk.sessions,ready:recovery.ready,setDrafts};
  return <div>{recovery.ready?'Ready':'Restoring'}</div>;
 }`},bundle:true,platform:'node',format:'cjs',external:['react'],write:false,plugins:[{
 name:'fake-tauri',setup(build){
  build.onResolve({filter:/^@tauri-apps\/api\//},args=>({path:args.path,namespace:'fake-tauri'}));
  build.onLoad({filter:/.*/,namespace:'fake-tauri'},()=>({contents:`export const invoke=(...args)=>globalThis.__recoveryTest.invoke(...args);export const listen=async()=>()=>{};`}));
 }
}]});
const module={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);

test('startup restores history and drafts without launching providers or saving empty initial state',async()=>{
 const dom=new JSDOM('<div id="root"></div>');
 const keys=['window','document','IS_REACT_ACT_ENVIRONMENT','__recoveryTest'];
 const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const calls=[],errors=[];let load;
 const snapshot={version:1,workspace:{mode:'columns',groups:[['chat'],['deleted'],[],[]],selected:['chat','deleted',null,null],focus:1},drafts:{chat:{text:'unsent text',missingAttachments:['image.png']}},recentProjects:['/project']};
 const fixture={error:message=>errors.push(message),invoke:async(command,args)=>{
  calls.push([command,args]);
  if(command==='load_workspace')return new Promise(resolve=>{load=resolve});
  if(command==='history')return [{id:'chat',provider:'Kiro',cwd:'/project',canResume:true}];
  if(command==='messages')return [{kind:'connection_started',data:null},{kind:'permission',data:{request:1}}];
  if(command==='save_workspace')return;
  throw Error('Unexpected command: '+command);
 }};
 globalThis.__recoveryTest=fixture;
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(module.exports.Harness)));
  assert.equal(fixture.state.ready,false);
  assert.equal(calls.some(([command])=>command==='save_workspace'),false);
  await act(async()=>load(JSON.stringify(snapshot)));
  assert.equal(fixture.state.ready,true);
  assert.deepEqual(fixture.state.workspace.groups,[['chat'],[],[],[]]);
  assert.equal(fixture.state.workspace.mode,'columns');
  assert.equal(fixture.state.drafts.chat.text,'unsent text');
  assert.deepEqual(fixture.state.drafts.chat.missingAttachments,['image.png']);
  assert.equal(fixture.state.sessions[0].live,false);
  assert.equal(fixture.state.sessions[0].busy,false);
  const saved=JSON.parse(calls.filter(([command])=>command==='save_workspace').at(-1)[1].raw);
  assert.equal(saved.drafts.chat.text,'unsent text');
  assert.equal(saved.drafts.deleted,undefined);
  assert.deepEqual(errors,[]);
  assert.ok(calls.every(([command])=>['load_workspace','save_workspace','history','messages'].includes(command)));
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  keys.forEach((key,i)=>{if(old[i])Object.defineProperty(globalThis,key,old[i]);else delete globalThis[key]});
 }
});
