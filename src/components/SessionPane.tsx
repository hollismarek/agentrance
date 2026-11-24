import React,{useMemo,useRef} from 'react';
import {useTranscriptScroll,type TranscriptPositions} from '../useTranscriptScroll';
import {PendingApprovals} from './PendingApprovals';
import {ActivityPanel} from '../ActivityPanel';
import {conversationTurns,questionAndAnswer} from '../conversation';
import {CopyButton} from './CopyButton';
import {AnswerMarkdown} from './AnswerMarkdown';
import type {Session} from '../types';
import {agentSelection,agentName,modelSelection} from '../agents';
import {AgentSelector} from './AgentSelector';
import {chatTitle} from '../history';
import {ErrorBoundary} from './ErrorBoundary';
export function SessionPane({session:s, onPermission, onCancel, onResume, resumeAvailable, onAgent, onModel, onHelp, onConnectionDetails, children,scrollPositions}: {
  scrollPositions?:TranscriptPositions;
  children?:React.ReactNode; onHelp:()=>void; onConnectionDetails?:()=>void; onModel:(id:string)=>void; onAgent:(id:string)=>void; session: Session; onResume: () => void; resumeAvailable: boolean; onPermission: (request: unknown, option: string | null) => Promise<void>; onCancel: () => void;
}) {
  const {selection,model}=useMemo(()=>({selection:agentSelection(s.items),model:modelSelection(s.items)}),[s.items]);
  const activeAgent=agentName(selection),activeModel=agentName(model);
  const turns=useMemo(()=>conversationTurns(s.items,s.busy),[s.items,s.busy]);
  const localPositions=useRef<TranscriptPositions>(new Map());
  const scroll=useTranscriptScroll(s.id,scrollPositions??localPositions.current);
  return <article>
    <div className="pane-title">
      <div className="session-summary">
        <strong title={chatTitle(s)}>{chatTitle(s)}</strong>
        <small className="session-provider" title={s.provider}>{s.provider}</small>
        <small className="session-connection">{s.resuming ? 'Reconnecting…' : s.live ? 'Connected' : 'Saved history'}</small>
      </div>
      <details className="session-details">
        <summary title="Show project, agent and model details" aria-label="Conversation details">Details</summary>
        <div className="session-details-body">
          <div className="session-project">Project: {s.cwd}</div>
          {activeAgent&&<div>Agent: {activeAgent}</div>}
          {activeModel&&<div>Model: {activeModel}</div>}
          {onConnectionDetails&&<button className="connection-details-button" type="button" onClick={onConnectionDetails}>Connection details…</button>}
        </div>
      </details>
    </div>
    <div className="messages" ref={scroll.body} onScroll={scroll.onScroll}><div ref={scroll.content}>{turns.map(turn=><section className="chat-turn" key={turn.key}>
      {turn.question!==null&&<div className="message user"><div className="message-heading"><label>You</label><CopyButton text={turn.question} label="Copy question"/></div><div>{turn.question}</div></div>}
      {turn.answer&&<div className="message delta"><div className="message-heading"><label>{s.provider}</label><div className="message-actions"><CopyButton text={turn.answer} label="Copy answer" disabled={!turn.complete}/>{turn.question!==null&&<CopyButton text={questionAndAnswer(turn,s.provider)} label="Copy Q&A" disabled={!turn.complete}/>}</div></div><AnswerMarkdown text={turn.answer}/></div>}
      {turn.errors.map((error,i)=><div className="message error" key={i}><label>Error</label><div>{error}</div></div>)}
    </section>)}{s.busy&&<p className="muted">Responding…</p>}</div></div>
    <ErrorBoundary key={s.id} label="Activity inspector">
      <ActivityPanel events={s.items} live={s.live} provider={s.provider} onPermission={onPermission}
        agentControl={<><AgentSelector selection={selection} live={s.live} busy={s.busy||!!s.resuming||!!s.changingModel} changing={!!s.changingAgent} onChange={onAgent}/>
          <AgentSelector label="Model" selection={model} live={s.live} busy={s.busy||!!s.resuming||!!s.changingAgent} changing={!!s.changingModel} onChange={onModel}/><button className="session-help" title="Agent and model details in Help" aria-label="Help for this conversation" onClick={onHelp}>?</button></>}/>
    </ErrorBoundary>
    {s.busy && <button onClick={onCancel}>Stop response</button>}
    {!s.live && <div className="resume-conversation" role="status">
      {s.canResume ? <><button disabled={s.resuming || !resumeAvailable} onClick={onResume}>{s.resuming ? 'Reconnecting…' : 'Continue conversation'}</button>
        <small>{!resumeAvailable?'Original provider unavailable. Open Menu → Settings.':''}</small></> :
        <small>Saved chat only — no provider session ID was recorded.</small>}
    </div>}
    <PendingApprovals events={s.items} live={s.live} provider={s.provider} onPermission={onPermission}/>
    {children}
  </article>;
}
