import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from "node:fs";
import {build} from 'esbuild';
const out=await build({entryPoints:['src/workspaceRecovery.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {parseRecovery,serializeRecovery,retainRecovery,recoveryWriter}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const layout={mode:'grid',focus:2,groups:[['a','b'],[],['c'],[]],selected:['b',null,'c',null]};
const wrap=layout=>({active:'default',entries:[{id:'default',name:'Workspace 1',project:'',layout}]});
const workspaces=wrap(layout);
const activeLayout=recovery=>recovery.workspaces.entries.find(entry=>entry.id===recovery.workspaces.active).layout;
test('workspace recovery retains pane order, selection, focus and text but never attachment bytes',()=>{
 const raw=serializeRecovery(workspaces,{b:{text:'long\nunfinished prompt',revision:3,attachments:[{name:'picture.png',data:'secret-image-bytes',id:'f'}]},c:{text:'another draft',revision:1}},['/repo']);
 assert.doesNotMatch(raw,/secret-image-bytes|"live"|"busy"/);
 const restored=parseRecovery(raw);
 assert.deepEqual(activeLayout(restored),layout);
 assert.equal(restored.drafts.b.text,'long\nunfinished prompt');
 assert.deepEqual(restored.drafts.b.attachments,[]);
 assert.deepEqual(restored.drafts.b.missingAttachments,['picture.png']);
 assert.equal(restored.drafts.c.text,'another draft');
 assert.deepEqual(restored.recentProjects,['/repo']);
 assert.deepEqual(parseRecovery(serializeRecovery(restored.workspaces,restored.drafts,restored.recentProjects)),restored);
});
test('recovery drops deleted conversations and their drafts without moving remaining tabs',()=>{
 const recovered=retainRecovery(parseRecovery(serializeRecovery(workspaces,{b:{text:'deleted',revision:0},c:{text:'keep',revision:0}},[])),['a','c']);
 assert.deepEqual(activeLayout(recovered).groups,[['a'],[],['c'],[]]);
 assert.deepEqual(activeLayout(recovered).selected,['a',null,'c',null]);
 assert.equal(recovered.drafts.b,undefined);assert.equal(recovered.drafts.c.text,'keep');
});
test('missing recovery starts empty and invalid snapshots are rejected',()=>{
 assert.equal(activeLayout(parseRecovery(null)).mode,'single');
 const good=JSON.parse(serializeRecovery(workspaces,{},[]));
 const invalidLayout=bad=>JSON.stringify({...good,workspaces:wrap({...layout,...bad})});
 for(const invalid of ['garbage','[]',JSON.stringify({...good,version:3}),invalidLayout({focus:8}),invalidLayout({groups:[['a','a'],[],[],[]]}),JSON.stringify({...good,drafts:{b:{text:3,missingAttachments:[]}}})])assert.throws(()=>parseRecovery(invalid));
});
test('recovery writes are serialized and coalesce to the newest pending snapshot',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve});const writes=[],errors=[];
 const write=recoveryWriter(async raw=>{writes.push(raw);if(raw==='first')await pending},e=>errors.push(e));
 write('first');await Promise.resolve();write('outdated');write('latest');assert.deepEqual(writes,['first']);
 finish();await pending;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes,['first','latest']);assert.deepEqual(errors,[]);
});
test('a failed recovery write is reported and does not prevent later saves',async()=>{
 const writes=[],errors=[];const write=recoveryWriter(async raw=>{writes.push(raw);if(raw==='bad')throw Error('disk full')},e=>errors.push(String(e)));
 write('bad');await Promise.resolve();write('retry');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes,['bad','retry']);assert.match(errors[0],/disk full/);
});
test('flush waits for the final queued edit, reports failures and can retry',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve});const writes=[];
 const write=recoveryWriter(async raw=>{writes.push(raw);if(raw==='old')await pending;if(raw==='bad')throw Error('disk full')},()=>{});
 write('old');await Promise.resolve();
 let flushed=false;const closing=write.flush('last edit').then(()=>{flushed=true});
 await Promise.resolve();assert.equal(flushed,false);
 finish();await closing;assert.deepEqual(writes,['old','last edit']);
 await assert.rejects(write.flush('bad'),/disk full/);
 await write.flush('retry');assert.equal(writes.at(-1),'retry');
});

test('the cross-platform legacy backup fixture migrates into the first named workspace',()=>{
 const fixture=readFileSync(new URL('./fixtures/backup-workspace.json',import.meta.url),'utf8');
 const restored=parseRecovery(fixture);
 assert.equal(restored.drafts.one.text,'unsent');
 assert.equal(restored.workspaces.entries[0].name,'Workspace 1');
 assert.equal(restored.workspaces.active,restored.workspaces.entries[0].id);
 assert.deepEqual(activeLayout(restored),JSON.parse(fixture).workspace);
});
test('named workspaces retain drafts and reject duplicate cross-workspace tab ownership',()=>{
 const other={id:'other',name:'Other project',project:'/other',layout:{mode:'single',focus:0,groups:[['d'],[],[],[]],selected:['d',null,null,null]}};
 const named={active:'other',entries:[...workspaces.entries,other]};
 const raw=serializeRecovery(named,{b:{text:'background draft'},d:{text:'active draft'}},[]);
 const restored=parseRecovery(raw);
 assert.deepEqual(restored.workspaces,named);
 assert.equal(restored.drafts.b.text,'background draft');
 assert.equal(restored.drafts.d.text,'active draft');
 const duplicate={...named,entries:[...workspaces.entries,{...other,layout}]};
 assert.throws(()=>parseRecovery(serializeRecovery(duplicate,{},[])));
});

test('a late open stays in the originating workspace and history focuses its existing owner',async()=>{
 const compiled=await build({entryPoints:['src/namedWorkspaces.ts'],bundle:true,platform:'node',format:'esm',write:false});
 const {initialWorkspaces,workspacesReducer:reduce}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 let state=reduce(initialWorkspaces,{type:'create',id:'other',name:'Other project',project:'/other'});
 state=reduce(state,{type:'open',id:'default',ids:['chat'],project:'/work'});
 assert.equal(state.active,'other');
 assert.deepEqual(state.entries[0].layout.groups[0],['chat']);
 assert.equal(state.entries[0].project,'/work');
 assert.deepEqual(state.entries[1].layout.groups[0],[]);
 state=reduce(state,{type:'open',id:'other',ids:['chat'],project:'/work'});
 assert.equal(state.active,'default');
 assert.deepEqual(state.entries[1].layout.groups[0],[]);
 assert.equal(state.entries[1].project,'/other');
});

test('the named workspace serializer agrees with the desktop and CLI backup fixture',()=>{
 const fixture=readFileSync(new URL('./fixtures/backup-workspaces.json',import.meta.url),'utf8');
 const {workspaces,drafts,recentProjects}=parseRecovery(fixture);
 assert.deepEqual(JSON.parse(serializeRecovery(workspaces,drafts,recentProjects)),JSON.parse(fixture));
});

test('old duplicate names are disambiguated while preserving the active workspace and tabs',()=>{
 const named={active:'other',entries:[
  ...workspaces.entries,
  {id:'other',name:'workspace 1',project:'/other',layout:{mode:'single',focus:0,groups:[['d'],[],[],[]],selected:['d',null,null,null]}},
  {id:'reserved',name:'Workspace 1 (2)',project:'',layout:{mode:'single',focus:0,groups:[[],[],[],[]],selected:[null,null,null,null]}},
 ]};
 const {workspaces:recovered,drafts}=parseRecovery(serializeRecovery(named,{d:{text:'keep this'}},[]));
 assert.equal(recovered.active,'other');
 assert.deepEqual(recovered.entries.map(entry=>entry.name),['Workspace 1','workspace 1 (3)','Workspace 1 (2)']);
 assert.deepEqual(recovered.entries.map(entry=>entry.layout),named.entries.map(entry=>entry.layout));
 assert.equal(drafts.d.text,'keep this');
});
