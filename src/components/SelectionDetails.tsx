import React from 'react';
import {agentName,rateText,type AgentSelection} from '../agents';
export function SelectionDetails({agent,model}:{agent:AgentSelection|null;model:AgentSelection|null}){
  return <section className="selection-reference">
      <p>Current model: <strong>{agentName(model)||'Not reported by provider'}</strong>{model?.current&&<> · Model identifier: <code>{model.current}</code></>}</p>
      <h4>Agents</h4>
      {agent?.choices.length?<dl>{agent.choices.map(c=><React.Fragment key={c.id}><dt>{c.name}{c.id===agent.current?' · selected':''}</dt><dd>{c.description||'No description supplied by provider.'}</dd></React.Fragment>)}</dl>:<p className="muted">Agent descriptions are not available for this session.</p>}
      <h4>Models</h4>
      {model?.choices.length?<dl>{model.choices.map(c=>{const rate=rateText(c);return <React.Fragment key={c.id}><dt>{c.name}{c.id===model.current?' · selected':''}{rate?` · ${rate}`:''}</dt><dd><code>{c.id}</code> — {c.description||'No description supplied by provider.'}</dd></React.Fragment>})}</dl>:<p className="muted">Model choices are not exposed by this provider.</p>}
  </section>;
}
