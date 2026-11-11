import React, {useId} from 'react';
import type {AgentSelection} from '../agents';
export function AgentSelector({selection,live,busy,changing,onChange}:{
  selection:AgentSelection|null;live:boolean;busy:boolean;changing:boolean;onChange:(id:string)=>void;
}) {
  const id=useId();
  const current=selection?.current??'';
  const known=!!selection?.choices.some(c=>c.id===current);
  const active=selection?.choices.find(c=>c.id===current);
  const available=!!selection?.choices.length;
  const help=!live?'Continue this conversation to change its agent.':changing?'Switching agent…':busy?'Wait for the response to finish before changing agents.':!available?'This provider has not exposed agent choices for this session.':active?.description||'Choose the agent for this conversation.';
  return <div className="agent-selector" title={help}>
    <label htmlFor={id}>Agent</label>
    <select id={id} aria-label="Conversation agent" disabled={!live||busy||changing||!available} value={current}
      onChange={e=>{if(e.target.value!==current)onChange(e.target.value)}}>
      {!known && <option value={current}>{current?`Current: ${current}`:available?'Not reported':'Not exposed by provider'}</option>}
      {selection?.choices.map(c=><option key={c.id} value={c.id} title={c.description||undefined}>{c.name}</option>)}
    </select>
    {changing&&<span className="agent-switching" role="status">Switching…</span>}
  </div>;
}
