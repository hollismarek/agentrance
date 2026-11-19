import test from 'node:test';import assert from 'node:assert/strict';
import {createReadScope,pendingReadCount} from '../src/attachmentReads.ts';
test('a remounted picker cannot commit old results or release a newer busy reservation',async()=>{
 let count=0;const draft=[];const busy=value=>{count=pendingReadCount(count,value)};
 const old=createReadScope(busy),oldRead=old.begin();assert.equal(count,1);
 old.dispose();assert.equal(count,0);
 const replacement=createReadScope(busy),newRead=replacement.begin();assert.equal(count,1);
 await Promise.resolve();if(oldRead.active())draft.push('old file');oldRead.finish();
 assert.equal(count,1);assert.deepEqual(draft,[]);
 if(newRead.active())draft.push('new file');newRead.finish();
 assert.equal(count,0);assert.deepEqual(draft,['new file']);replacement.dispose();assert.equal(count,0);
});
test('overlapping reads remain busy until every reservation finishes',()=>{
 let count=0;const scope=createReadScope(value=>{count=pendingReadCount(count,value)});
 const a=scope.begin(),b=scope.begin();assert.equal(count,2);
 a.finish();a.finish();assert.equal(count,1);scope.dispose();assert.equal(count,0);assert.equal(b.active(),false);b.finish();assert.equal(count,0);
});
