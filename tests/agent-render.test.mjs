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
import {CompareDialog} from './src/components/CompareDialog';
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
export function renderPending(live=true){
 const s={...session,live,items:[{kind:'permission',data:{request:8,params:{toolCall:{toolCallId:'approval',title:'Read project'},options:[{optionId:'yes',kind:'allow_once',name:'Allow once'}]}}}]};
 return renderToStaticMarkup(<SessionPane session={s} onHelp={()=>{}} onAgent={()=>{}} onModel={()=>{}} onPermission={async()=>{}} onCancel={()=>{}} onResume={()=>{}} resumeAvailable={true}/>);
}
export function renderCompare(){return renderToStaticMarkup(<CompareDialog providers={[]} onClose={()=>{}} onCompare={()=>{}}/>)}
export function renderSetup(){return renderToStaticMarkup(<ProviderSettings providers={[{id:'test',name:'Test CLI',executable:'test',args:['one argument with spaces','--flag'],env:{PATH:'/configured/bin'},cwd:''}]} onSave={async()=>{}} onClose={()=>{}}/>)}
export function renderPermission(params){return renderToStaticMarkup(<PermissionDetails params={params} provider="Generic ACP"/>)}
export function renderDetails(topic='models'){
 return renderToStaticMarkup(<HelpDialog initialTopic={topic} sessions={[session]} onClose={()=>{}}/>);
}
export function renderConnection(items,live=true){
 return renderToStaticMarkup(<HelpDialog initialTopic="connection" sessions={[{...session,live,items}]} onClose={()=>{}}/>);
}
export function renderUsage(items,live=true){
 return renderToStaticMarkup(<HelpDialog initialTopic="usage" sessions={[{...session,live,items:[...session.items,...items]}]} onClose={()=>{}}/>);
}
export function renderSession(busy=false,answer='My answer'){
 const items=session.items.filter(e=>!busy||e.kind!=='done').map(e=>e.kind==='delta'?{...e,data:answer}:e);
 const s={...session,busy,items};
 return renderToStaticMarkup(<SessionPane session={s} onHelp={()=>{}} onAgent={()=>{}} onModel={()=>{}} onPermission={async()=>{}} onCancel={()=>{}} onResume={()=>{}} resumeAvailable={true}/>);
}
export function renderWorkspace(){return renderToStaticMarkup(<><Sidebar hasProviders past={[]} panes={[]} starting={false} busyIds={[]} onStart={()=>{}} onOpen={()=>{}} onRename={async()=>{}} onDelete={async()=>{}}/><AppMenu onSettings={()=>{}} onHelp={()=>{}}/><Composer text="" onText={()=>{}} onSend={()=>{}} canSend={false}/></>)}
export function render(live=true,busy=false,changing=false){
 const selection={current:'review',choices:[{id:'review',name:'Reviewer'},{id:'code',name:'Coder'}]};
 return renderToStaticMarkup(<ActivityPanel events={[]} live={live} provider="Kiro CLI" onPermission={async()=>{}}
   agentControl={<AgentSelector selection={selection} live={live} busy={busy} changing={changing} onChange={()=>{}}/>}/>);
}`},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});
const module={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {render,renderDetails,renderConnection,renderUsage,renderSession,renderWorkspace,renderPermission,renderSetup,renderFourPanes,renderLoadingMenu,renderPending,renderCompare}=module.exports;
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

test('active approvals remain actionable with Activity collapsed, but saved requests cannot approve',()=>{
 const html=renderPending();assert.match(html,/pending-approvals/);assert.match(html,/Allow once/);assert.doesNotMatch(html,/class="activity-body"/);
 assert.doesNotMatch(renderPending(false),/pending-approvals/);
});

test('Compare exposes the attachment picker, hides an empty strip and starts disabled',()=>{
 const html=renderCompare();assert.match(html,/aria-label="Attach files"/);assert.match(html,/type="file"/);
 assert.doesNotMatch(html,/class="attachment-strip"/);assert.match(html,/sent to every provider/);
 assert.match(html,/<button class="primary" disabled="">Start comparison<\/button>/);
});

test('saved agent responses render Markdown without embedding HTML or fetching images',()=>{
 const answer=['## Review','', '- **Change** this','', '```js','const item = 1 < 2;','```','',
  '| File | Result |', '| --- | --- |', '| a.ts | Pass |','',
  '<iframe src="https://example.com"></iframe>','', '![External image](https://example.com/pixel.png)'].join('\n');
 const html=renderSession(false,answer);
 assert.match(html,/<h2>Review<\/h2>/);
 assert.match(html,/<li><strong>Change<\/strong> this<\/li>/);
 assert.match(html,/<pre><code class="language-js">const item = 1 &lt; 2;/);
 assert.match(html,/<table>/);
 assert.match(html,/External image/);
 assert.doesNotMatch(html,/<iframe|<img/);
});


test('connection details distinguish advertised features, current configuration and observed approvals',()=>{
 const init={agentInfo:{name:'provider',title:'Example Provider',version:'2.0'},protocolVersion:1,
  agentCapabilities:{loadSession:true,sessionCapabilities:{resume:{},list:{}},promptCapabilities:{image:true,audio:true},customFeature:true},
  _meta:{'_example':{}}};
 const permission={kind:'permission',data:{request:1}};
 const state={kind:'agent_state',data:{revision:2,configOptions:[{id:'reason',name:'Reasoning effort',category:'reasoning'}],
  model:{current:'review',choices:[{id:'review',name:'Review model'}]}}};
 const live=renderConnection([{kind:'identity',data:init},permission,state]);
 assert.match(live,/Current ACP connection/);
 assert.match(live,/Example Provider · 2.0/);
 assert.match(live,/Resume without replay<\/dt><dd>Advertised/);
 assert.match(live,/Audio input<\/dt><dd>Advertised <small>Audio prompts are unavailable in Agentrance/);
 assert.match(live,/_example/);
 assert.match(live,/customFeature/);
 assert.match(live,/Reasoning effort/);
 assert.match(live,/Review model/);
 assert.match(live,/provider requested approval/);

 const resumed=renderConnection([{kind:'identity',data:init},permission,state,{kind:'connection_started',data:{protocolVersion:1}},{
  kind:'agent_state',data:{revision:0,configOptions:[]},
 }],false);
 assert.match(resumed,/Last recorded ACP connection/);
 assert.match(resumed,/Resume without replay<\/dt><dd>Not advertised/);
 assert.match(resumed,/No approval requests recorded/);
 assert.doesNotMatch(resumed,/Example Provider|_example|Reasoning effort|Review model/);
 assert.match(renderConnection([],false),/No ACP handshake was saved/);
});

test('connection details attribute reconnect approvals by transport even before the success marker',()=>{
 const handshake=(id,kind='connection_started')=>({kind,data:{protocolVersion:1,agentranceConnectionId:id}});
 const permission=id=>({kind:'permission',data:{request:7,agentranceConnectionId:id}});
 const old=handshake('old','identity');
 const reconnect=permission('reconnect');
 assert.match(renderConnection([old,reconnect,handshake('reconnect')]),/provider requested approval/);
 assert.match(renderConnection([old,reconnect],false),/No approval requests recorded/);
 assert.match(renderConnection([handshake(undefined,'identity'),reconnect],false),/No approval requests recorded/);
 assert.match(renderConnection([old,permission('old'),reconnect],false),/provider requested approval/);
});

test('session usage displays the latest ACP totals and distinguishes saved reports',()=>{
 const handshake=id=>({kind:'connection_started',data:{agentranceConnectionId:id}});
 const usage=(used,cost=null)=>({kind:'session_usage',data:{used,size:100,cost,agentranceConnectionId:'active'}});
 const prior=usage(10,{amount:1,currency:'credits'});
 const latest=usage(25,{amount:2,currency:'credits'});
 const active=renderUsage([handshake('active'),prior,latest]);
 assert.match(active,/Latest ACP report for this connection/);
 assert.match(active,/25 \/ 100 tokens/);
 assert.match(active,/Session cost<\/dt><dd>2 credits/);
 assert.doesNotMatch(active,/1 credits/);
 assert.match(renderUsage([handshake('active'),latest,usage(30)]),/Session cost<\/dt><dd>Unavailable/);
 assert.match(renderUsage([handshake('active'),latest,handshake('reconnected')]),/Last recorded ACP usage report/);
 assert.match(renderUsage([handshake('active'),latest],false),/Last recorded ACP usage report/);
 assert.match(renderUsage([]),/No ACP usage update has been received/);
 assert.match(renderFourPanes(),/Session usage…/);
});
