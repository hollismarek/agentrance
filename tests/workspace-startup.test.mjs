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
 import {initialWorkspaces,workspacesReducer} from './src/namedWorkspaces';
 import {WorkspaceLayout} from './src/components/WorkspaceLayout';
 import {WorkspaceSwitcher} from './src/components/WorkspaceSwitcher';
 export function Harness(){
  const [workspaces,dispatchWorkspaces]=useReducer(workspacesReducer,initialWorkspaces);
  const workspace=workspaces.entries.find(entry=>entry.id===workspaces.active).layout;
  const dispatch=action=>dispatchWorkspaces({type:'layout',id:workspaces.active,action});
  const [drafts,setDrafts]=useState({});
  const desk=useSessions(globalThis.__recoveryTest.error);
  const recovery=useWorkspaceRecovery(workspaces,drafts,dispatchWorkspaces,setDrafts,desk.restore,globalThis.__recoveryTest.error);
  globalThis.__recoveryTest.state={workspace,dispatch,dispatchWorkspaces,drafts,sessions:desk.sessions,desk,...recovery,setDrafts};
  if(globalThis.__recoveryTest.renderSwitcher)return <>
   <WorkspaceSwitcher workspaces={workspaces} sessions={desk.sessions} disabled={!recovery.ready}
    onSwitch={id=>dispatchWorkspaces({type:'switch',id})} onCreate={()=>{}} onEdit={()=>{}}/>
   <WorkspaceLayout workspaceId={workspaces.active} workspace={workspace} dispatch={dispatch} desk={desk} providers={[]} drafts={drafts} setDrafts={setDrafts} onHelp={()=>{}}/>
  </>;
  if(globalThis.__recoveryTest.renderDesk)return <WorkspaceLayout workspace={workspace} dispatch={dispatch} desk={desk} providers={[]} drafts={drafts} setDrafts={setDrafts} onHelp={()=>{}}/>;
  return <div>{recovery.ready?'Ready':'Restoring'}</div>;
 }`},bundle:true,platform:'node',format:'cjs',external:['react'],write:false,plugins:[{
 name:'fake-tauri',setup(build){
  build.onResolve({filter:/^@tauri-apps\/api\//},args=>({path:args.path,namespace:'fake-tauri'}));
  build.onLoad({filter:/.*/,namespace:'fake-tauri'},()=>({contents:`export const invoke=(...args)=>globalThis.__recoveryTest.invoke(...args);export const listen=async(...args)=>globalThis.__recoveryTest.listen?.(...args)??(()=>{});`}));
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
  if(command==='save_workspace'||command==='enable_workspace_recovery_guard')return;
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
  assert.ok(calls.every(([command])=>['load_workspace','save_workspace','history','messages','enable_workspace_recovery_guard'].includes(command)));
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  keys.forEach((key,i)=>{if(old[i])Object.defineProperty(globalThis,key,old[i]);else delete globalThis[key]});
 }
});

async function withClosingFixture(save,run){
 const dom=new JSDOM('<div id="root"></div>');
 const keys=['window','document','IS_REACT_ACT_ENVIRONMENT','__recoveryTest','ResizeObserver'];
 const old=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,ResizeObserver:class{observe(){}disconnect(){}}});
 const calls=[],handlers=new Map(),errors=[];
 const saved={version:1,workspace:{mode:'single',groups:[['chat'],[],[],[]],selected:['chat',null,null,null],focus:0},drafts:{chat:{text:'old draft',missingAttachments:[]}},recentProjects:[]};
 const fixture={calls,handlers,errors,error:message=>errors.push(message),listen:(name,handler)=>{handlers.set(name,handler);return()=>handlers.delete(name)},invoke:async(command,args)=>{
  calls.push([command,args]);
  if(command==='load_workspace')return JSON.stringify(saved);
  if(command==='history')return [{id:'chat',provider:'Kiro',cwd:'/project'}];
  if(command==='messages')return [];
  if(command==='save_workspace')return save(args.raw);
  if(command==='enable_workspace_recovery_guard'||command==='finish_app_exit')return;
  throw Error('Unexpected command: '+command);
 }};
 globalThis.__recoveryTest=fixture;
 const root=createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(module.exports.Harness)));
  await run(fixture);
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  keys.forEach((key,i)=>{if(old[i])Object.defineProperty(globalThis,key,old[i]);else delete globalThis[key]});
 }
}
test('normal close waits for a blocked write and flushes the final edit before exiting',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve});const saved=[];
 await withClosingFixture(async raw=>{saved.push(JSON.parse(raw));if(saved.length===1)await pending},async fixture=>{
  await act(async()=>fixture.state.setDrafts(all=>({...all,chat:{...all.chat,text:'final edit before closing'}})));
  const origin=document.createElement('button');document.body.append(origin);origin.focus();
  let closing;
  await act(async()=>{closing=fixture.handlers.get('workspace-close-requested')();await Promise.resolve()});
  assert.equal(fixture.state.closing,true);
  assert.equal(fixture.state.closeFocus.current,origin);
  assert.equal(fixture.calls.some(([command])=>command==='finish_app_exit'),false);
  await act(async()=>fixture.handlers.get('workspace-close-requested')());
  await act(async()=>{finish();await closing});
  assert.equal(saved.at(-1).drafts.chat.text,'final edit before closing');
  assert.equal(fixture.calls.filter(([command])=>command==='finish_app_exit').length,1);
 });
});
test('save failure keeps the window open and a subsequent close retries successfully',async()=>{
 let fail=true;
 await withClosingFixture(async()=>{if(fail)throw Error('disk full')},async fixture=>{
  await act(async()=>fixture.handlers.get('workspace-close-requested')());
  assert.match(fixture.state.closeError,/disk full.*kept open/);
  assert.equal(fixture.state.closing,false);
  assert.equal(fixture.calls.some(([command])=>command==='finish_app_exit'),false);
  fail=false;
  await act(async()=>fixture.handlers.get('workspace-close-requested')());
  assert.equal(fixture.calls.filter(([command])=>command==='finish_app_exit').length,1);
 });
});
async function pendingSend(fixture){
 const original=fixture.invoke;let resolve,reject,args;
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no});
 fixture.invoke=(command,input)=>{
  if(command==='resume_session')return Promise.resolve();
  if(command==='prompt'){args=input;return pending}
  return original(command,input);
 };
 await act(async()=>fixture.state.desk.resume(fixture.state.sessions[0],{id:'kiro',name:'Kiro',cwd:'/project'}));
 fixture.renderDesk=true;
 await act(async()=>fixture.state.setDrafts(all=>({...all,chat:{...all.chat,attachments:[{id:'image',name:'diagram.png',mimeType:'image/png',data:'aGk=',size:2}],revision:1}})));
 await act(async()=>document.querySelector('button.primary').click());
 assert.ok(args?.submissionId,'send has a correlation ID for the recorded-prompt acknowledgment');
 return {args,resolve,reject};
}
test('quit preserves a pending draft when send is rejected before it is recorded',async()=>{
 const saved=[];
 await withClosingFixture(async raw=>saved.push(JSON.parse(raw)),async fixture=>{
  const send=await pendingSend(fixture);
  assert.equal(document.querySelector('textarea').value,'old draft','send must not optimistically erase the draft');
  await act(async()=>fixture.handlers.get('workspace-close-requested')());
  assert.equal(saved.at(-1).drafts.chat.text,'old draft');
  assert.deepEqual(saved.at(-1).drafts.chat.missingAttachments,['diagram.png']);
  assert.equal(fixture.calls.filter(([command])=>command==='finish_app_exit').length,1);
  await act(async()=>send.reject(Error('Unsupported attachment')));
  assert.equal(fixture.state.drafts.chat.text,'old draft');
  assert.equal(fixture.state.drafts.chat.attachments[0].name,'diagram.png');
 });
});
test('only the matching recorded-prompt acknowledgment clears the submitted draft',async()=>{
 await withClosingFixture(async()=>{},async fixture=>{
  const send=await pendingSend(fixture),accepted=fixture.handlers.get('prompt-accepted');
  await act(async()=>accepted({payload:{id:'chat',submissionId:'unrelated'}}));
  assert.equal(fixture.state.drafts.chat.text,'old draft');
  await act(async()=>accepted({payload:{id:'another-chat',submissionId:send.args.submissionId}}));
  assert.equal(fixture.state.drafts.chat.text,'old draft');
  await act(async()=>accepted({payload:{id:'chat',submissionId:send.args.submissionId}}));
  assert.equal(fixture.state.drafts.chat.text,'');
  assert.deepEqual(fixture.state.drafts.chat.attachments,[]);
  await act(async()=>send.resolve());
 });
});
test('recorded-prompt acknowledgments cannot clear newer typing',async()=>{
 await withClosingFixture(async()=>{},async fixture=>{
  const send=await pendingSend(fixture);
  await act(async()=>fixture.state.setDrafts(all=>({...all,chat:{...all.chat,text:'next question',revision:all.chat.revision+1}})));
  await act(async()=>fixture.handlers.get('prompt-accepted')({payload:{id:'chat',submissionId:send.args.submissionId}}));
  assert.equal(fixture.state.drafts.chat.text,'next question');
  await act(async()=>send.resolve());
  assert.equal(fixture.state.drafts.chat.text,'next question');
 });
});

test('stacked divider disables at the pane minimums and resizes after the workspace grows',async()=>{
 await withClosingFixture(async()=>{},async fixture=>{
  let height=650,measure;
  globalThis.ResizeObserver=class{
   constructor(callback){this.callback=callback}
   observe(node){
    if(!node.classList.contains('workspace'))return;
    Object.defineProperty(node,'clientHeight',{configurable:true,get:()=>height});
    measure=this.callback;
    measure();
   }
   disconnect(){}
  };
  fixture.renderDesk=true;
  await act(async()=>fixture.state.dispatch({type:'mode',mode:'rows'}));
  const divider=document.querySelector('[role="separator"]');
  const pane=document.querySelector('.workspace-pane');
  const grow=()=>act(async()=>divider.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true})));
  assert.equal(pane.style.minHeight,'360px');
  assert.equal(divider.getAttribute('aria-disabled'),'true');
  assert.equal(divider.hasAttribute('tabindex'),false);
  await grow();
  assert.equal(pane.style.flexGrow,'50');
  height=807;
  await act(async()=>measure());
  assert.equal(divider.hasAttribute('aria-disabled'),false);
  assert.equal(divider.getAttribute('aria-valuemax'),'55');
  await grow();
  assert.equal(divider.getAttribute('aria-valuenow'),'55');
  assert.equal(pane.style.flexGrow,'55');
 });
});

test('switching workspaces preserves drafts, pane placement and background approvals',async()=>{
 await withClosingFixture(async()=>{},async fixture=>{
  fixture.renderSwitcher=true;
  const initial=fixture.invoke;
  const permission={kind:'permission',data:{request:1,params:{toolCall:{toolCallId:'read',title:'Read repository'},options:[]}}};
  fixture.invoke=async(command,args)=>{
   if(command==='resume_session')return;
   if(command==='messages')return args.id==='chat'?[permission]:[];
   return initial(command,args);
  };
  const saved={id:'second',provider:'Kiro',cwd:'/second',title:'Second project chat'};
  await act(async()=>fixture.state.dispatch({type:'mode',mode:'columns'}));
  await act(async()=>fixture.state.dispatch({type:'move',id:'chat',pane:1}));
  await act(async()=>fixture.state.desk.resume(fixture.state.sessions[0],{id:'kiro',name:'Kiro',cwd:'/project'}));
  await act(async()=>fixture.state.desk.open(saved,()=>{}));
  const dispatch=fixture.state.dispatchWorkspaces;
  await act(async()=>{
   dispatch({type:'create',id:'second-project',name:'Second project',project:'/second'});
   dispatch({type:'open',id:'second-project',ids:['second']});
  });
  assert.match(document.querySelector('[role=tab]').textContent,/Second project chat/);
  assert.equal(document.querySelectorAll('.workspace-pane').length,1);
  assert.equal(document.querySelector('[aria-label="1 pending approval in other workspaces"]').textContent,'! 1');
  const switcher=document.querySelector('select[aria-label="Workspace"]');
  await act(async()=>{
   switcher.value='default';switcher.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  assert.equal(document.querySelectorAll('.workspace-pane').length,2);
  assert.equal(document.querySelector('[aria-label="Conversation pane 2"] textarea').value,'old draft');
  assert.equal(document.querySelector('[aria-label="1 pending approval in other workspaces"]'),null);
  assert.equal(fixture.state.sessions.find(session=>session.id==='chat').live,true);
  assert.equal(fixture.calls.some(([command])=>command==='close_session'),false);
 });
});
