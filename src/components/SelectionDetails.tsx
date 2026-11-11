import React from 'react';
import {agentName,rateText,type AgentSelection} from '../agents';
export function SelectionDetails({agent,model}:{agent:AgentSelection|null;model:AgentSelection|null}){
  return <details className="selection-details">
    <summary>Agent &amp; model details</summary>
    <div className="selection-detail-body">
      <p><strong>Agent</strong> selects the workflow and instructions. <strong>Model</strong> selects the AI used by that workflow.</p>
      <p>Current model: <strong>{agentName(model)||'Not reported by provider'}</strong>{model?.current&&<> · Model identifier: <code>{model.current}</code></>}</p>
      <p className="muted">An automatic setting such as “auto” lets the provider choose models by task; it does not identify one fixed underlying model.</p>
      <h4>Agents</h4>
      {agent?.choices.length?<dl>{agent.choices.map(c=><React.Fragment key={c.id}><dt>{c.name}{c.id===agent.current?' · selected':''}</dt><dd>{c.description||'No description supplied by provider.'}</dd></React.Fragment>)}</dl>:<p className="muted">Agent descriptions are not available for this session.</p>}
      <h4>Models</h4>
      {model?.choices.length?<dl>{model.choices.map(c=><React.Fragment key={c.id}><dt>{c.name}{c.id===model.current?' · selected':''}{rateText(c)?` · ${rateText(c)}`:''}</dt><dd><code>{c.id}</code> — {c.description||'No description supplied by provider.'}</dd></React.Fragment>)}</dl>:<p className="muted">Model choices are not exposed by this provider.</p>}
      <p className="muted">Rates appear only when reported by the provider. They are relative multipliers, not the total cost of a conversation.</p>
    </div>
  </details>;
}
