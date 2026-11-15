import React,{useMemo} from 'react';
import {ActivityPanel} from '../ActivityPanel';
import {conversationTurns,questionAndAnswer} from '../conversation';
import {CopyButton} from './CopyButton';
import type {Session} from '../types';
import {agentSelection,agentName,modelSelection} from '../agents';
import {AgentSelector} from './AgentSelector';
import {chatTitle} from '../history';
import {ErrorBoundary} from './ErrorBoundary';
export function SessionPane({session:s, onPermission, onCancel, onResume, resumeAvailable, onAgent, onModel, onHelp, children}: {
  children?:React.ReactNode; onHelp:()=>void; onModel:(id:string)=>void; onAgent:(id:string)=>void; session: Session; onResume: () => void; resumeAvailable: boolean; onPermission: (request: unknown, option: string | null) => Promise<void>; onCancel: () => void;
}) {
  const {selection,model}=useMemo(()=>({selection:agentSelection(s.items),model:modelSelection(s.items)}),[s.items]);
  const activeAgent=agentName(selection),activeModel=agentName(model);
  const turns=useMemo(()=>conversationTurns(s.items,s.busy),[s.items,s.busy]);
  return <article>
    <div className="pane-title"><strong>{chatTitle(s)}</strong>
      <small>{s.provider} · {s.resuming ? 'Reconnecting…' : s.live ? 'Connected' : 'Saved history'}{activeAgent?` · ${activeAgent}`:''}{activeModel?` · Model: ${activeModel}`:''}</small><small>{s.cwd}</small>
    </div>
    <div className="messages">{turns.map(turn=><section className="chat-turn" key={turn.key}>
      {turn.question!==null&&<div className="message user"><div className="message-heading"><label>You</label><CopyButton text={turn.question} label="Copy question"/></div><div>{turn.question}</div></div>}
      {turn.answer&&<div className="message delta"><div className="message-heading"><label>{s.provider}</label><div className="message-actions"><CopyButton text={turn.answer} label="Copy answer" disabled={!turn.complete}/>{turn.question!==null&&<CopyButton text={questionAndAnswer(turn,s.provider)} label="Copy Q&A" disabled={!turn.complete}/>}</div></div><div>{turn.answer}</div></div>}
      {turn.errors.map((error,i)=><div className="message error" key={i}><label>Error</label><div>{error}</div></div>)}
    </section>)}{s.busy&&<p className="muted">Responding…</p>}</div>
    <ErrorBoundary key={s.id} label="Activity inspector">
      <ActivityPanel events={s.items} live={s.live} provider={s.provider} onPermission={onPermission}
        agentControl={<><AgentSelector selection={selection} live={s.live} busy={s.busy||!!s.resuming||!!s.changingModel} changing={!!s.changingAgent} onChange={onAgent}/>
          <AgentSelector label="Model" selection={model} live={s.live} busy={s.busy||!!s.resuming||!!s.changingAgent} changing={!!s.changingModel} onChange={onModel}/><button className="session-help" title="Agent and model details in Help" aria-label="Help for this conversation" onClick={onHelp}>?</button></>}/>
    </ErrorBoundary>
    {s.busy && <button onClick={onCancel}>Stop response</button>}
    {!s.live && <div className="resume-conversation" role="status">
      {s.canResume ? <><button disabled={s.resuming || !resumeAvailable} onClick={onResume}>{s.resuming ? 'Reconnecting…' : 'Continue conversation'}</button>
        <small>{!resumeAvailable?'Original provider unavailable. Open Menu → Provider settings.':''}</small></> :
        <small>Saved chat only — no provider session ID was recorded.</small>}
    </div>}
    {children}
  </article>;
}
