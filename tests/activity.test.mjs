import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceActivity, operationOutput, commandText, elapsed} from '../src/activity.ts';
const tool = (data, at=1000) => ({kind:'tool',data,at});
const permission = (request=1, id='x') => ({kind:'permission',at:1100,data:{request,params:{toolCall:{toolCallId:id},options:[{optionId:'once',kind:'allow_once',name:'Allow once'}]}}});
const initial = tool({toolCallId:'x',title:'Run checks',kind:'execute',status:'in_progress',rawInput:{command:'cargo test'}});
test('output appears while running, before final response; cumulative snapshots replace rather than duplicate', () => {
 const events=[initial,tool({toolCallId:'x',rawOutput:{stdout:'first line\n'}},1300)];
 let [op]=reduceActivity(events);assert.equal(op.status,'running');assert.equal(operationOutput(op).stdout,'first line\n');
 events.push(tool({toolCallId:'x',rawOutput:{stdout:'first line\nsecond line\n',stderr:'warning',exitCode:0},status:'completed'},1800));
 [op]=reduceActivity(events);assert.equal(op.status,'completed');assert.equal(operationOutput(op).stdout,'first line\nsecond line\n');assert.equal(operationOutput(op).stderr,'warning');assert.equal(operationOutput(op).exitCode,0);assert.equal(elapsed(op,9000),'0.8s elapsed');assert.equal(commandText(op),'cargo test');
});
test('sparse patches and null raw fields preserve previous input/output/title',()=>{
 const [op]=reduceActivity([initial,tool({toolCallId:'x',rawOutput:{stdout:'ok'},content:[{type:'content',content:{type:'text',text:'ok'}}]}),tool({toolCallId:'x',title:null,rawInput:null,rawOutput:null,status:'completed'})]);
 assert.equal(op.title,'Run checks');assert.equal(commandText(op),'cargo test');assert.equal(operationOutput(op).stdout,'ok');assert.equal(operationOutput(op).text,'ok');
});
test('permission-only operation is awaiting, allow records decision but never fabricates running',()=>{
 const events=[permission()];assert.equal(reduceActivity(events)[0].status,'awaiting');
 events.push({kind:'permission_resolved',data:{request:1,option:'once',optionKind:'allow_once'}});
 const [op]=reduceActivity(events);assert.equal(op.status,'pending');assert.equal(op.approvals[0].decision.option,'once');
});
test('permission denial is separate from tool failure and no approval is inferred from name',()=>{
 const [op]=reduceActivity([permission(),{kind:'permission_resolved',at:1200,data:{request:1,option:'no',optionKind:'reject_once',optionName:'OK'}}]);assert.equal(op.status,'declined');
});
test('multiple simultaneous permissions retain independent request identities',()=>{
 const events=[initial,permission(1),permission(2),{kind:'permission_resolved',data:{request:1,option:'once',optionKind:'allow_once'}}];
 const [op]=reduceActivity(events);assert.equal(op.status,'awaiting');assert.equal(op.approvals.length,2);assert.equal(op.approvals[1].decision,undefined);
});
test('missing output and exit code remain unknown; unlabelled text is not stdout',()=>{
 const [op]=reduceActivity([initial,tool({toolCallId:'x',content:[{type:'content',content:{type:'text',text:'provider result'}}],status:'completed'})]);
 const out=operationOutput(op);assert.equal(out.stdout,undefined);assert.equal(out.stderr,undefined);assert.equal(out.exitCode,undefined);assert.equal(out.text,'provider result');
});
test('generic raw values and terminal references are retained without claiming terminal support',()=>{
 const [op]=reduceActivity([tool({toolCallId:'x',rawOutput:'opaque provider result',content:[{type:'terminal',terminalId:'t1'}]})]);
 assert.equal(operationOutput(op).raw,'opaque provider result');assert.deepEqual(operationOutput(op).terminals,['t1']);
});
test('failed call exposes stderr and nonzero exit code',()=>{
 const [op]=reduceActivity([initial,tool({toolCallId:'x',status:'failed',rawOutput:{stderr:'bad',exit_code:2}},2000)]);assert.equal(op.status,'failed');assert.equal(operationOutput(op).exitCode,2);
});
test('parallel operations and out of order initial notification merge by tool id',()=>{
 const ops=reduceActivity([tool({toolCallId:'a',status:'in_progress'}),initial,tool({toolCallId:'a',title:'Read config',status:'completed'})]);assert.equal(ops.length,2);assert.equal(ops[0].title,'Read config');assert.equal(ops[1].status,'running');
});
test('done/disconnect/close never invent success and expire pending approval',()=>{
 for(const kind of ['done','disconnected','session_closed']){
 const [op]=reduceActivity([initial,permission(),{kind,at:2000,data:null}]);assert.equal(op.status,'interrupted');assert.equal(op.approvals[0].expired,true);assert.equal(elapsed(op,9000),'1.0s elapsed');}
});
test('completed calls remain completed on disconnect; saved unresolved calls cannot approve',()=>{
 assert.equal(reduceActivity([initial,tool({toolCallId:'x',status:'completed'}),{kind:'disconnected',data:null}])[0].status,'completed');
 const [op]=reduceActivity([initial,permission()],false);assert.equal(op.status,'interrupted');assert.equal(op.approvals[0].expired,true);assert.equal(elapsed(op,9000),'Elapsed time unavailable');
});
test('legacy events have unknown elapsed time and preserve history',()=>{
 const [op]=reduceActivity([{kind:'tool',data:{toolCallId:'old',status:'completed'}}],false);assert.equal(elapsed(op,1000),'Elapsed time unavailable');
});
test('persisted events replay identically to live accumulated events',()=>{
 const events=[initial,permission(),{kind:'permission_resolved',at:1400,data:{request:1,option:'once',optionKind:'allow_once'}},tool({toolCallId:'x',status:'completed'},2000)];
 assert.deepEqual(reduceActivity(JSON.parse(JSON.stringify(events)),false),reduceActivity(events,true));
});
test('malformed optional provider metadata cannot crash the activity reducer',()=>{
 const [op]=reduceActivity([null,{kind:'permission',data:null},tool({toolCallId:'x',title:{bad:true},kind:42,content:[null,{type:'content',content:{type:'text',text:{bad:true}}},{type:'terminal',terminalId:42}],status:'in_progress'})]);
 assert.equal(op.title,'Tool operation');assert.equal(op.kind,undefined);assert.equal(operationOutput(op).text,'');assert.deepEqual(operationOutput(op).terminals,[]);
});
test('a permission decision racing with turn completion is still retained',()=>{
 const [op]=reduceActivity([permission(),{kind:'done',at:1200,data:null},{kind:'permission_resolved',at:1300,data:{request:1,option:'once',optionKind:'allow_once'}}]);
 assert.equal(op.approvals[0].decision.option,'once');assert.equal(op.status,'interrupted');
});
test('reconnecting expires old approvals and cannot reuse decisions across provider processes',()=>{
 const events=[permission(1,'old'),{kind:'connection_started',data:{}},permission(1,'new'),{kind:'permission_resolved',data:{request:1,option:'once',optionKind:'allow_once'}}];
 const ops=reduceActivity(events,true);assert.equal(ops[0].approvals[0].expired,true);assert.equal(ops[0].approvals[0].decision,undefined);assert.equal(ops[0].status,'interrupted');
 assert.equal(ops[1].approvals[0].decision.option,'once');assert.equal(ops[1].status,'pending');
});
