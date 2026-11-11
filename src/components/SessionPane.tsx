import React from 'react';
import {ActivityPanel} from '../ActivityPanel';
import type {ActivityEvent} from '../activity';
import type {Session} from '../types';
import {agentSelection,agentName,modelSelection} from '../agents';
import {SelectionDetails} from './SelectionDetails';
import {AgentSelector} from './AgentSelector';
import {chatTitle} from '../history';
import {ErrorBoundary} from './ErrorBoundary';
export function SessionPane({session:s, onPermission, onCancel, onResume, resumeAvailable, onAgent, onModel}: {
  onModel:(id:string)=>void; onAgent:(id:string)=>void; session: Session; onResume: () => void; resumeAvailable: boolean; onPermission: (request: unknown, option: string | null) => Promise<void>; onCancel: () => void;
}) {
  const selection=agentSelection(s.items);
  const activeAgent=agentName(selection);
  const model=modelSelection(s.items);
  const activeModel=agentName(model);
  const merged: ActivityEvent[] = [];
  for (const m of s.items.filter(m => ['user','delta','error'].includes(m.kind))) {
    if (m.kind === 'delta' && merged.at(-1)?.kind === 'delta') merged[merged.length-1].data += m.data;
    else merged.push({...m});
  }
  return <article>
    <div className="pane-title"><strong>{chatTitle(s)}</strong>
      <small>{s.provider} · {s.resuming ? 'Reconnecting…' : s.live ? 'Connected' : 'Saved history'}{activeAgent?` · ${activeAgent}`:''}{activeModel?` · Model: ${activeModel}`:''}</small><small>{s.cwd}</small>
    </div>
    <div className="messages">{merged.map((m,i) => <div key={i} className={'message '+m.kind}>
      <label>{m.kind === 'user' ? 'You' : m.kind === 'delta' ? s.provider : m.kind}</label><div>{String(m.data)}</div>
    </div>)}{s.busy && <p className="muted">Responding…</p>}</div>
    <ErrorBoundary key={s.id} label="Activity inspector">
      <ActivityPanel events={s.items} live={s.live} provider={s.provider} onPermission={onPermission}
        agentControl={<><AgentSelector selection={selection} live={s.live} busy={s.busy||!!s.resuming||!!s.changingModel} changing={!!s.changingAgent} onChange={onAgent}/>
          <AgentSelector label="Model" selection={model} live={s.live} busy={s.busy||!!s.resuming||!!s.changingAgent} changing={!!s.changingModel} onChange={onModel}/></>}
        controlDetails={<SelectionDetails agent={selection} model={model}/>}/>
    </ErrorBoundary>
    {s.busy && <button onClick={onCancel}>Stop response</button>}
    {!s.live && <div className="resume-conversation" role="status">
      {s.canResume ? <><button disabled={s.resuming || !resumeAvailable} onClick={onResume}>{s.resuming ? 'Reconnecting…' : 'Continue conversation'}</button>
        <small>{resumeAvailable ? 'Restores this chat with its original provider and project.' : 'Restore the original provider configuration in Provider settings to continue this chat.'}</small></> :
        <small>This older chat has no recoverable provider session ID. You can read it here; new chats support continuing from history.</small>}
    </div>}
  </article>;
}
