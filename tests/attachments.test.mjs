import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['src/drafts.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {editDraft,setAttachments,clearDraft,restoreDraft}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
test('attachments stay with a session and failed sends restore only untouched drafts',()=>{
 const files=[{id:'f',name:'notes.txt',data:'aGk=',mimeType:'text/plain',size:2}];
 let d=editDraft({},'a','question');d=editDraft(d,'b','other');d=setAttachments(d,'a',files);
 const revision=d.a.revision+1;d=clearDraft(d,'a');
 assert.deepEqual(restoreDraft(d,'a','question',revision,files).a.attachments,files);
 const edited=editDraft(d,'a','new question');assert.equal(restoreDraft(edited,'a','old',revision,files),edited);
 assert.equal(d.b.text,'other');assert.deepEqual(setAttachments({},'closed',files),{});
});
