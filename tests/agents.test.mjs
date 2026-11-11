import test from 'node:test';
import assert from 'node:assert/strict';
import {agentSelection,agentName} from '../src/agents.ts';
const state=(current='review',revision=1)=>({kind:'agent_state',data:{revision,selection:{current,choices:[{id:'review',name:'Reviewer'},{id:'code',name:'Coder'}]}}});
test('restores agent choices and active name from saved events',()=>{
 const events=[state(),{kind:'tool',data:{}},state('code')];
 assert.equal(agentName(agentSelection(events)),'Coder');
 assert.deepEqual(agentSelection(JSON.parse(JSON.stringify(events))),agentSelection(events));
});
test('connection boundary clears stale choices until provider reports current state',()=>{
 assert.equal(agentSelection([state(),{kind:'connection_started',data:{}}]),null);
 assert.equal(agentName(agentSelection([state(),{kind:'connection_started',data:{}},state('code')])),'Coder');
});
test('missing, removed and malformed choices do not invent agents',()=>{
 assert.equal(agentSelection([]),null);assert.equal(agentSelection([state(),{kind:'agent_state',data:{revision:2,selection:null}}]),null);
 assert.deepEqual(agentSelection([{kind:'agent_state',data:{revision:1,selection:{choices:[null,{id:42,name:'bad'}],current:42}}}]),{current:null,choices:[]});
});
test('session-specific choices and unknown reported current IDs are preserved',()=>{
 assert.equal(agentName(agentSelection([state('unlisted-custom-agent')])),'unlisted-custom-agent');
 assert.equal(agentName(agentSelection([state('review')])),'Reviewer');
 assert.equal(agentName(agentSelection([state('code')])),'Coder');
});

test('late publication of an older snapshot cannot undo a newer provider report',()=>{
 assert.equal(agentName(agentSelection([state('code',8),state('review',7)])),'Coder');
 assert.equal(agentSelection([state('code',8),{kind:'agent_state',data:{revision:9,selection:null}},state('review',7)]),null);
});
