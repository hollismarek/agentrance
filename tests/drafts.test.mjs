import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/drafts.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {editDraft:edit,restoreDraft:restore}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('failed send restores cleared draft without changing other chats',()=>{
 let d=edit({},'a','question');d=edit(d,'b','another draft');d=edit(d,'a','');const rev=d.a.revision;
 d=restore(d,'a','question',rev);assert.equal(d.a.text,'question');assert.equal(d.b.text,'another draft');
});
test('failure does not overwrite newer typing, deliberate clearing or a closed chat',()=>{
 let d=edit({},'a','');const rev=d.a.revision;
 d=edit(d,'a','new question');assert.equal(restore(d,'a','old question',rev),d);
 d=edit(d,'a','');assert.equal(restore(d,'a','old question',rev),d);
 assert.deepEqual(restore({},'a','old question',rev),{});
});
