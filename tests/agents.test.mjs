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
test('models stay distinct from agent profiles, including auto and reported rates',async()=>{
 const {modelSelection,rateText}=await import('../src/agents.ts');
 const event=state('review',2);event.data.model={current:'auto',choices:[{id:'auto',name:'Auto',description:'Chosen by task',rateMultiplier:1,rateUnit:'credits'},{id:'sonnet',name:'Claude Sonnet',rateMultiplier:1.3}]};
 assert.equal(agentName(agentSelection([event])),'Reviewer');
 assert.equal(agentName(modelSelection([event])),'Auto');
 assert.equal(rateText(modelSelection([event]).choices[0]),'1.00× credits');
 assert.equal(rateText(modelSelection([event]).choices[1]),'1.30× relative rate');
 assert.equal(rateText({id:'unknown',name:'Unknown'}),null);
 const newer={...event,data:{...event.data,revision:3,model:{current:'sonnet',choices:event.data.model.choices}}};
 assert.equal(agentName(modelSelection([newer,event])),'Claude Sonnet');
 assert.equal(modelSelection([event,{kind:'connection_started',data:{}}]),null);
});
