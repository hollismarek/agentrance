import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

const output=await build({entryPoints:['src/components/AttachmentPicker.tsx'],bundle:true,
 platform:'node',format:'cjs',external:['react'],write:false});
const module={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);
const {AttachmentPicker}=module.exports;

test('removing an attachment during a file read preserves the newer list and rejects the late result',async()=>{
 const dom=new JSDOM('<!doctype html><div id="root"></div>');
 const globals=['window','document','IS_REACT_ACT_ENVIRONMENT'];
 const previous=globals.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.getElementById('root');
 const root=createRoot(container);
 let finishRead;
 const pending=new Promise(resolve=>{finishRead=resolve});
 let reads=0;
 const selected={name:'late.txt',type:'text/plain',size:4,arrayBuffer(){reads++;return pending}};
 const attachment=id=>({id,name:`${id}.txt`,mimeType:'text/plain',data:'aGk=',size:2});
 let files=[attachment('remove'),attachment('keep')];
 const changes=[],busy=[];
 function render(){root.render(React.createElement(AttachmentPicker,{files,onFiles(next){
  changes.push(next);files=next;render();
 },onBusy:value=>busy.push(value)}))}
 try{
  await act(async()=>render());
  const input=container.querySelector('input[type="file"]');
  Object.defineProperty(input,'files',{configurable:true,value:[selected]});
  await act(async()=>{input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  assert.equal(reads,1);
  assert.equal(container.querySelector('[aria-label="Attach files"]').disabled,true);

  await act(async()=>{container.querySelector('[aria-label="Remove remove.txt"]').click()});
  const afterRemoval=files;
  assert.deepEqual(files.map(file=>file.name),['keep.txt']);

  await act(async()=>{finishRead(new TextEncoder().encode('late').buffer);await pending});
  assert.equal(files,afterRemoval,'the stale handler must not replace the updated draft');
  assert.equal(changes.length,1,'only the explicit removal changes attachments');
  assert.equal(container.querySelector('[aria-label="Remove remove.txt"]'),null);
  assert.equal(container.querySelector('[aria-label="Remove late.txt"]'),null);
  assert.ok(container.querySelector('[aria-label="Remove keep.txt"]'));
  assert.match(container.querySelector('[role="alert"]').textContent,/Attachments changed while loading/);
  assert.equal(container.querySelector('[aria-label="Attach files"]').disabled,false);
  assert.deepEqual(busy,[true,false]);
 }finally{
  await act(async()=>root.unmount());
  dom.window.close();
  globals.forEach((key,index)=>{if(previous[index])Object.defineProperty(globalThis,key,previous[index]);else delete globalThis[key]});
 }
});
