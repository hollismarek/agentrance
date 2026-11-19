import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['src/workspaceRecovery.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {parseRecovery,serializeRecovery,retainRecovery,recoveryWriter}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const workspace={mode:'grid',focus:2,groups:[['a','b'],[],['c'],[]],selected:['b',null,'c',null]};
test('workspace recovery retains pane order, selection, focus and text but never attachment bytes',()=>{
 const raw=serializeRecovery(workspace,{b:{text:'long\nunfinished prompt',revision:3,attachments:[{name:'picture.png',data:'secret-image-bytes',id:'f'}]},c:{text:'another draft',revision:1}},['/repo']);
 assert.doesNotMatch(raw,/secret-image-bytes|"live"|"busy"/);
 const restored=parseRecovery(raw);
 assert.deepEqual(restored.workspace,workspace);
 assert.equal(restored.drafts.b.text,'long\nunfinished prompt');
 assert.deepEqual(restored.drafts.b.attachments,[]);
 assert.deepEqual(restored.drafts.b.missingAttachments,['picture.png']);
 assert.equal(restored.drafts.c.text,'another draft');
 assert.deepEqual(restored.recentProjects,['/repo']);
 assert.deepEqual(parseRecovery(serializeRecovery(restored.workspace,restored.drafts,restored.recentProjects)),restored);
});
test('recovery drops deleted conversations and their drafts without moving remaining tabs',()=>{
 const recovered=retainRecovery(parseRecovery(serializeRecovery(workspace,{b:{text:'deleted',revision:0},c:{text:'keep',revision:0}},[])),['a','c']);
 assert.deepEqual(recovered.workspace.groups,[['a'],[],['c'],[]]);
 assert.deepEqual(recovered.workspace.selected,['a',null,'c',null]);
 assert.equal(recovered.drafts.b,undefined);assert.equal(recovered.drafts.c.text,'keep');
});
test('missing recovery starts empty and invalid snapshots are rejected',()=>{
 assert.equal(parseRecovery(null).workspace.mode,'single');
 const good=JSON.parse(serializeRecovery(workspace,{},[]));
 for(const invalid of ['garbage','[]',JSON.stringify({...good,version:2}),JSON.stringify({...good,workspace:{...workspace,focus:8}}),JSON.stringify({...good,workspace:{...workspace,groups:[['a','a'],[],[],[]]}}),JSON.stringify({...good,drafts:{b:{text:3,missingAttachments:[]}}})])assert.throws(()=>parseRecovery(invalid));
});
test('recovery writes are serialized and coalesce to the newest pending snapshot',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve});const writes=[],errors=[];
 const write=recoveryWriter(async raw=>{writes.push(raw);if(raw==='first')await pending},e=>errors.push(e));
 write('first');write('outdated');write('latest');assert.deepEqual(writes,['first']);
 finish();await pending;await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes,['first','latest']);assert.deepEqual(errors,[]);
});
test('a failed recovery write is reported and does not prevent later saves',async()=>{
 const writes=[],errors=[];const write=recoveryWriter(async raw=>{writes.push(raw);if(raw==='bad')throw Error('disk full')},e=>errors.push(String(e)));
 write('bad');write('retry');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(writes,['bad','retry']);assert.match(errors[0],/disk full/);
});
