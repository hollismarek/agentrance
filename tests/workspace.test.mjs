import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/workspace.ts'],bundle:true,format:'esm',platform:'node',write:false});
const {initialWorkspace,workspaceReducer:r,paneCount}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
function invariant(s){
 const ids=s.groups.flat();assert.equal(new Set(ids).size,ids.length);
 assert.ok(s.focus>=0&&s.focus<paneCount(s.mode));
 s.selected.forEach((id,p)=>{if(id)assert.ok(s.groups[p].includes(id));if(p>=paneCount(s.mode)){assert.equal(id,null);assert.deepEqual(s.groups[p],[])}});
}
test('opening sessions retains tabs and targets the focused pane',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a']});s=r(s,{type:'mode',mode:'rows'});s=r(s,{type:'focus',pane:1});s=r(s,{type:'open',ids:['b']});
 assert.deepEqual(s.groups,[['a'],['b'],[],[]]);assert.deepEqual(s.selected,['a','b',null,null]);
 s=r(s,{type:'open',ids:['c']});assert.deepEqual(s.groups,[['a'],['b','c'],[],[]]);
 s=r(s,{type:'open',ids:['a']});assert.equal(s.focus,0);assert.deepEqual(s.groups,[['a'],['b','c'],[],[]]);invariant(s);
});
test('comparison chooses up to four independent panes and retains extra providers as tabs',()=>{
 const three=r(initialWorkspace,{type:'open',ids:['kiro','local','third']});
 assert.equal(three.mode,'three');assert.deepEqual(three.selected,['kiro','local','third',null]);
 const five=r(initialWorkspace,{type:'open',ids:['a','b','c','d','e']});
 assert.equal(five.mode,'grid');assert.deepEqual(five.groups,[['a','e'],['b'],['c'],['d']]);invariant(five);
 const two=r(initialWorkspace,{type:'open',ids:['a','b']});assert.equal(two.mode,'columns');invariant(two);
});
test('moving a conversation transfers its tab and expands the layout when needed',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a']});s=r(s,{type:'open',ids:['b']});s=r(s,{type:'move',id:'b',pane:3});
 assert.deepEqual(s.groups,[['a'],[],[],['b']]);assert.deepEqual(s.selected,['a',null,null,'b']);assert.equal(s.mode,'grid');assert.equal(s.focus,3);invariant(s);
});
test('reducing layouts preserves every tab and the focused conversation',()=>{
 for(const mode of ['single','columns','rows','three']){
  let s=r(initialWorkspace,{type:'open',ids:['a','b','c','d','e']});s=r(s,{type:'focus',pane:3});s=r(s,{type:'mode',mode});
  assert.deepEqual([...s.groups.flat()].sort(),['a','b','c','d','e']);assert.equal(s.selected[s.focus],'d');invariant(s);
 }
});
test('closing or deleting tabs selects a remaining conversation in the same pane',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a','b','c','d','e']});s=r(s,{type:'retain',ids:['a','b','c','d']});assert.equal(s.selected[0],'a');
 s=r(s,{type:'retain',ids:['a']});assert.deepEqual(s.selected,['a',null,null,null]);assert.deepEqual(s.groups,[['a'],[],[],[]]);invariant(s);
 assert.equal(r(s,{type:'retain',ids:['a']}),s);
});
test('invalid pane actions and unknown moves do not corrupt workspace state',()=>{
 const s=r(initialWorkspace,{type:'open',ids:['a']});
 for(const action of [{type:'focus',pane:3},{type:'focus',pane:-1},{type:'move',pane:4,id:'a'},{type:'move',pane:1,id:'missing'},{type:'select',pane:0,id:'missing'}])assert.equal(r(s,action),s);
 invariant(s);
});
test('repeated layout transitions and new sessions preserve independent selection',()=>{
 let s=r(initialWorkspace,{type:'open',ids:['a','b','c','d']});
 for(const mode of ['three','rows','single','grid','columns','single','three']){
  s=r(s,{type:'mode',mode});s=r(s,{type:'focus',pane:paneCount(mode)-1});s=r(s,{type:'open',ids:[`new-${mode}`]});invariant(s);
 }
 assert.ok(s.groups.flat().includes('a'));assert.ok(s.groups.flat().includes('d'));
});
