import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationTurns,questionAndAnswer} from '../src/conversation.ts';
const e=(kind,data,seq)=>({kind,data,seq});
test('copyable Q&A preserves streamed Markdown/code and excludes tool activity',()=>{
 const answer='Review:\n\n```rust\nfn main() {}\n```\n';
 const events=[e('user','Can you review?\nKeep details.',1),e('delta','Review:\n\n',2),e('tool',{rawOutput:'private tool output'},3),e('permission',{request:1},4),e('delta','```rust\nfn main() {}\n```\n',5),e('done',null,6)];
 const [turn]=conversationTurns(events);assert.equal(turn.question,'Can you review?\nKeep details.');assert.equal(turn.answer,answer);assert.equal(turn.complete,true);
 assert.equal(questionAndAnswer(turn,'Kiro CLI'),`You\nCan you review?\nKeep details.\n\nKiro CLI\n${answer}`);
 assert.doesNotMatch(questionAndAnswer(turn,'Kiro CLI'),/private tool output/);
});
test('multiple turns keep the correct question/answer pairs',()=>{
 const turns=conversationTurns([e('user','First',1),e('delta','Answer one',2),e('done',null,3),e('user','Second',4),e('delta','Answer two',5),e('done',null,6)]);
 assert.equal(turns.length,2);assert.equal(turns[0].question,'First');assert.equal(turns[1].answer,'Answer two');assert.notEqual(turns[0].key,turns[1].key);
});
test('streaming response is not copy-ready but older completed turns are',()=>{
 const turns=conversationTurns([e('user','First',1),e('delta','Done',2),e('done',null,3),e('user','Next',4),e('delta','Partial',5)],true);
 assert.equal(turns[0].complete,true);assert.equal(turns[1].complete,false);
});
test('legacy saved logs without done markers and provider greetings remain readable',()=>{
 const turns=conversationTurns([e('delta','Welcome',1),e('user','Question',2),e('delta','Saved answer',3)]);
 assert.equal(turns[0].question,null);assert.equal(turns[0].answer,'Welcome');assert.equal(turns[1].complete,true);
});
test('disconnect/error closes a partial response without merging it into the next connection',()=>{
 const turns=conversationTurns([e('user','Q',1),e('delta','Partial',2),e('error','Connection failed',3),e('disconnected',null,4),e('connection_started',{},5),e('user','Follow up',6),e('delta','New response',7)],true);
 assert.equal(turns[0].complete,true);assert.deepEqual(turns[0].errors,['Connection failed']);assert.equal(turns[0].answer,'Partial');assert.equal(turns[1].answer,'New response');assert.equal(turns[1].complete,false);
});
