import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
// Check the actual React markup without requiring a browser download.
const output=await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActivityPanel} from './src/ActivityPanel';
import {AgentSelector} from './src/components/AgentSelector';
import {HelpDialog} from './src/components/HelpDialog';
import {SessionPane} from './src/components/SessionPane';
import {Sidebar} from './src/components/Sidebar';
import {Composer} from './src/components/Composer';
import {AppMenu} from './src/components/AppMenu';
import {PermissionDetails} from './src/components/PermissionDetails';
import {ProviderSettings} from './src/components/ProviderSettings';
import {WorkspaceLayout} from './src/components/WorkspaceLayout';
import {initialWorkspace,workspaceReducer} from './src/workspace';
const report={revision:1,selection:{current:'plan',choices:[{id:'plan',name:'Plan',description:'Plan before coding'}]},model:{current:'auto',choices:[{id:'auto',name:'Auto',description:'Models chosen by task',rateMultiplier:1,rateUnit:'credits'}]}};
const session={id:'s',provider:'Kiro CLI',cwd:'/tmp/project',title:'A chat',live:true,busy:false,canResume:true,items:[{kind:'user',data:'My question',seq:1},{kind:'delta',data:'My answer',seq:2},{kind:'done',data:null,seq:3},{kind:'agent_state',data:report,seq:4}]};
export function renderFourPanes(){
 const workspace=workspaceReducer(initialWorkspace,{type:'open',ids:['a','b','c','d']});
 const sessions=['a','b','c','d'].map((id,i)=>({...session,id,provider:'Provider '+(i+1)}));
 const desk={sessions};
 return renderToStaticMarkup(<WorkspaceLayout workspace={workspace} dispatch={()=>{}} desk={desk} providers={[]} drafts={{a:{text:'First draft',revision:1},d:{text:'Fourth draft',revision:1}}} setDrafts={()=>{}} onHelp={()=>{}}/>);
}
export function renderLoadingMenu(){return renderToStaticMarkup(<AppMenu settingsReady={false} onSettings={()=>{}} onHelp={()=>{}}/>)}
export function renderSetup(){return renderToStaticMarkup(<ProviderSettings providers={[{id:'test',name:'Test CLI',executable:'test',args:['one argument with spaces','--flag'],env:{PATH:'/configured/bin'},cwd:''}]} onSave={async()=>{}} onClose={()=>{}}/>)}
export function renderPermission(params){return renderToStaticMarkup(<PermissionDetails params={params} provider="Generic ACP"/>)}
export function renderDetails(topic='models'){
 return renderToStaticMarkup(<HelpDialog initialTopic={topic} sessions={[session]} onClose={()=>{}}/>);
}
export function renderSession(busy=false){
 const s=busy?{...session,busy:true,items:session.items.filter(e=>e.kind!=='done')}:session;
 return renderToStaticMarkup(<SessionPane session={s} onHelp={()=>{}} onAgent={()=>{}} onModel={()=>{}} onPermission={async()=>{}} onCancel={()=>{}} onResume={()=>{}} resumeAvailable={true}/>);
}
export function renderWorkspace(){return renderToStaticMarkup(<><Sidebar providers={[]} selected="" past={[]} panes={[]} starting={false} busyIds={[]} onStart={()=>{}} onSelect={()=>{}} onOpen={()=>{}} onRename={async()=>{}} onDelete={async()=>{}}/><AppMenu onSettings={()=>{}} onHelp={()=>{}}/><Composer text="" onText={()=>{}} onSend={()=>{}} canSend={false}/></>)}
export function render(live=true,busy=false,changing=false){
 const selection={current:'review',choices:[{id:'review',name:'Reviewer'},{id:'code',name:'Coder'}]};
 return renderToStaticMarkup(<ActivityPanel events={[]} live={live} provider="Kiro CLI" onPermission={async()=>{}}
   agentControl={<AgentSelector selection={selection} live={live} busy={busy} changing={changing} onChange={()=>{}}/>}/>);
}`},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});
const module={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {render,renderDetails,renderSession,renderWorkspace,renderPermission,renderSetup,renderFourPanes,renderLoadingMenu}=module.exports;
test('agent selector is present beside Activity when inspector is collapsed',()=>{
 const html=render();assert.match(html,/aria-expanded="false"/);assert.doesNotMatch(html,/class="activity-body"/);
 assert.match(html,/<\/button><div class="agent-selector"/);
 assert.match(html,/aria-label="Conversation agent"/);assert.match(html,/<option value="review" selected="">Reviewer<\/option>/);
 assert.doesNotMatch(html,/<select[^>]*disabled/);
});
test('saved, busy and switching sessions disable agent changes independently of Activity',()=>{
 for(const args of [[false,false,false],[true,true,false],[true,false,true]])assert.match(render(...args),/<select[^>]*disabled=""/);
 assert.match(render(true,false,true),/Switching…/);
});

test('agent/model descriptions now live in the central Help dialog',()=>{
 const html=renderDetails();assert.match(html,/role="dialog"/);assert.match(html,/Help &amp; About/);assert.match(html,/Plan before coding/);assert.match(html,/Models chosen by task/);assert.match(html,/single fixed model/);
 assert.doesNotMatch(renderSession(),/class="selection-details"|class="selection-reference"|<p>Plan before coding/);
});
test('conversation offers question, answer and Q&A copying alongside compact controls',()=>{
 const html=renderSession();assert.match(html,/aria-label="Copy question"/);assert.match(html,/aria-label="Copy answer"/);assert.match(html,/aria-label="Copy Q&amp;A"/);
 assert.match(html,/aria-label="Conversation model"/);assert.match(html,/Auto · 1.00× credits/);assert.doesNotMatch(html,/class="activity-body"/);
 const live=renderSession(true);assert.match(live,/disabled=""[^>]*aria-label="Copy answer"/);assert.match(live,/disabled=""[^>]*aria-label="Copy Q&amp;A"/);
});
test('workspace omits standing privacy/keyboard guidance and exposes a central Help menu',()=>{
 const html=renderWorkspace();assert.doesNotMatch(html,/Authentication stays|No app telemetry/);assert.doesNotMatch(html,/<small>Enter to send/);assert.match(html,/Help &amp; About/);
 assert.match(renderDetails('about'),/no application telemetry/);assert.match(renderDetails('start'),/Shift\+Enter/);
});

test('permission presentation shows full agent description and retains raw request under closed technical details',()=>{
 const command='cd /home/project && git log --oneline -15';
 const html=renderPermission({toolCall:{toolCallId:'opaque-id',title:command,status:'pending'},options:[{optionId:'once',name:'Allow once',kind:'allow_once'}]});
 const primary=html.split('<details')[0];
 assert.match(primary,/Generic ACP · Pending/);
 assert.match(primary,/cd \/home\/project &amp;&amp; git log --oneline -15/);
 assert.doesNotMatch(primary,/opaque-id|toolCallId|"status"/);
 assert.match(html,/<details class="permission-technical"><summary>Technical details/);
 assert.match(html,/opaque-id/);assert.match(html,/Allow once/);
});
test('sparse and malformed permission descriptions fall back without inventing commands',()=>{
 for(const params of [null,{toolCall:{toolCallId:'id'}},{toolCall:{title:{invalid:true},locations:[null,{},3],content:[null]}}]){
  const html=renderPermission(params);
  assert.match(html,/did not supply a description/);assert.doesNotMatch(html,/Reported command|undefined/);
 }
});
test('permission presentation preserves supplied input, full paths and proposed diff text',()=>{
 const html=renderPermission({toolCall:{title:'Edit file',kind:'edit',locations:[{path:'/project/a.ts',line:8}],rawInput:{path:'/project/a.ts'},content:[{type:'diff',path:'/project/a.ts',oldText:'old',newText:'new'}]}});
 const primary=html.split('<details')[0];
 assert.match(primary,/Generic ACP · Edit/);assert.match(primary,/\/project\/a.ts/);assert.match(primary,/Line 8/);
 assert.match(primary,/Tool input supplied by provider/);assert.match(primary,/Old text/);assert.match(primary,/New text/);
});

test('provider setup exposes a labeled project field and portable executable guidance',()=>{
 const html=renderSetup();assert.match(html,/aria-label="Project directory for Test CLI"/);
 assert.match(html,/Choose an existing absolute project folder/);assert.match(html,/node.exe/);assert.match(html,/absolute executable path/);
});

test('four-pane workspace renders independent labeled composers and navigation controls',()=>{
 const html=renderFourPanes();
 for(let i=1;i<=4;i++){
  assert.match(html,new RegExp(`aria-label="Conversation pane ${i}"`));
  assert.match(html,new RegExp(`aria-label="Message to Provider ${i}"`));
  assert.match(html,new RegExp(`aria-label="Move conversation from pane ${i}"`));
 }
 assert.match(html,/First draft/);assert.match(html,/Fourth draft/);
 assert.equal((html.match(/Focus pane/g)||[]).length,4);
 assert.doesNotMatch(html,/Resize conversation panes/);
});
test('appearance belongs in Settings, while the menu only opens settings/help',()=>{
 assert.doesNotMatch(renderWorkspace(),/aria-label="Appearance"/);
 const html=renderSetup();assert.match(html,/aria-label="Appearance"/);
 for(const value of ['system','light','dark'])assert.match(html,new RegExp(`value="${value}"`));
});

test('provider settings offers named fields, individual arguments and environment rows without JSON',()=>{
 const html=renderSetup();
 for(const label of ['Display name for provider 1','Executable for provider 1','Argument 1 for provider 1','Environment name 1 for provider 1','Environment value 1 for provider 1'])assert.ok(html.includes(label),label);
 assert.match(html,/one argument with spaces/);assert.match(html,/value="PATH"/);
 assert.doesNotMatch(html,/<textarea|Provider configuration/);
 assert.match(html,/Installed providers/);assert.match(html,/Save settings/);
});

test('Settings is unavailable until initial provider configuration is ready',()=>{
 assert.match(renderLoadingMenu(),/<button disabled="">Settings \(loading…\)<\/button>/);
});
test('Help uses current Settings and Appearance navigation',()=>{
 const html=renderDetails('start');
 assert.match(html,/Menu → Settings → Appearance/);assert.match(html,/Menu → Settings/);
 assert.doesNotMatch(html,/Menu → Provider settings|Menu → Appearance/);
});
