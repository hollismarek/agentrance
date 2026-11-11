import React, {useId} from 'react';
import {rateText,type AgentSelection} from '../agents';
export function AgentSelector({selection,live,busy,changing,onChange,label='Agent'}:{
  label?:'Agent'|'Model';selection:AgentSelection|null;live:boolean;busy:boolean;changing:boolean;onChange:(id:string)=>void;
}) {
  const id=useId();
  const noun=label.toLowerCase();
  const current=selection?.current??'';
  const known=!!selection?.choices.some(c=>c.id===current);
  const active=selection?.choices.find(c=>c.id===current);
  const available=!!selection?.choices.length;
  const help=!live?`Continue this conversation to change its ${noun}.`:changing?`Switching ${noun}…`:busy?`Wait for the response or other selection change to finish.`:!available?`This provider has not exposed ${noun} choices for this session.`:active?.description||`Choose the ${noun} for this conversation.`;
  return <div className="agent-selector" title={help}>
    <label htmlFor={id}>{label}</label>
    <select id={id} aria-label={`Conversation ${noun}`} disabled={!live||busy||changing||!available} value={current}
      onChange={e=>{if(e.target.value!==current)onChange(e.target.value)}}>
      {!known && <option value={current}>{current?`Current: ${current}`:available?'Not reported':'Not exposed by provider'}</option>}
      {selection?.choices.map(c=>{const rate=label==='Model'?rateText(c):null;return <option key={c.id} value={c.id} title={c.description||undefined}>{c.name}{rate?` · ${rate}`:''}</option>})}
    </select>
    {changing&&<span className="agent-switching" role="status">Switching…</span>}
  </div>;
}
