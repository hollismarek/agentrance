import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultProviders,parseProviders} from '../src/providers.ts';
import {mergeEvents} from '../src/sessionEvents.ts';
test('default project uses runtime directory; custom existing settings are preserved',()=>{
 const defaults=defaultProviders('/tmp/project');assert.equal(defaults[0].cwd,'/tmp/project');
 const custom={...defaults[0],cwd:'/work/my-code',args:['acp','--model','custom'],env:{REGION:'local'}};
 assert.deepEqual(parseProviders(JSON.stringify([custom])),[custom]);
});
test('bad JSON, duplicate ids, invalid args/env and relative paths are rejected',()=>{
 assert.throws(()=>parseProviders('{bad'));
 const [p]=defaultProviders('/tmp/project');
 for(const values of [[],[p,p],[{...p,args:[1]}],[{...p,env:{TOKEN:42}}],[{...p,env:[]}],[{...p,cwd:'.'}],[{...p,name:''}]]) {
  assert.throws(()=>parseProviders(JSON.stringify(values)));
 }
});
test('concurrent event emission is restored to storage order without duplicates',()=>{
 const e=(seq,kind)=>({seq,kind,data:null});
 const merged=mergeEvents([e(4,'done'),e(2,'tool')],[e(3,'permission_resolved'),e(2,'tool'),e(1,'permission')]);
 assert.deepEqual(merged.map(e=>e.seq),[1,2,3,4]);assert.equal(merged.length,4);
});
test('history plus startup event buffering retains new events exactly once',()=>{
 const event={seq:1,kind:'tool',data:{toolCallId:'a'}};
 assert.deepEqual(mergeEvents([event],[event,{seq:2,kind:'done',data:null}]).map(e=>e.seq),[1,2]);
});
