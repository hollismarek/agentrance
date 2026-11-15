import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/workspace.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {initialWorkspace,workspaceReducer:r}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
test('opening sessions retains tabs and targets the focused pane',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a']});s=r(s,{type:'mode',mode:'rows'});s=r(s,{type:'focus',pane:1});s=r(s,{type:'open',ids:['b']});
 assert.deepEqual(s.groups,[['a'],['b']]);assert.deepEqual(s.selected,['a','b']);
 s=r(s,{type:'open',ids:['c']});assert.deepEqual(s.groups,[['a'],['b','c']]);
 s=r(s,{type:'open',ids:['a']});assert.equal(s.focus,0);assert.deepEqual(s.groups,[['a'],['b','c']]);
});
test('fresh comparison displays independent sessions and retains extra providers as tabs',()=>{
 const s=r(initialWorkspace,{type:'open',ids:['kiro','local','third']});
 assert.equal(s.mode,'columns');assert.deepEqual(s.groups,[['kiro','third'],['local']]);assert.deepEqual(s.selected,['third','local']);
});
test('moving a conversation transfers its tab without duplication and opens a split',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a']});s=r(s,{type:'open',ids:['b']});s=r(s,{type:'move',id:'b',pane:1});
 assert.deepEqual(s.groups,[['a'],['b']]);assert.deepEqual(s.selected,['a','b']);assert.equal(s.mode,'columns');assert.equal(s.focus,1);
});
test('single-pane mode keeps every tab and the focused conversation',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a','b']});s=r(s,{type:'mode',mode:'single'});
 assert.deepEqual(s.groups,[['a','b'],[]]);assert.deepEqual(s.selected,['b',null]);assert.equal(s.focus,0);
});
test('closing and deleting tabs select a remaining conversation in the same pane',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a','b','c']});s=r(s,{type:'retain',ids:['a','b']});assert.deepEqual(s.selected,['a','b']);
 s=r(s,{type:'retain',ids:['a']});assert.deepEqual(s.selected,['a',null]);assert.deepEqual(s.groups,[['a'],[]]);
 assert.equal(r(s,{type:'retain',ids:['a']}),s);
});
