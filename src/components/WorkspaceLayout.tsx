import React, {useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {resumeProvider} from '../providers';
import type {Provider} from '../types';
import type {useSessions} from '../useSessions';
import {initialWorkspace,workspaceReducer} from '../workspace';
import {editDraft,restoreDraft,type Drafts} from '../drafts';
import {chatTitle} from '../history';
import {SessionPane} from './SessionPane';
import {Composer} from './Composer';
import {ErrorBoundary} from './ErrorBoundary';

export function WorkspaceLayout({workspace,dispatch,desk,providers,drafts,setDrafts,onHelp}:{
  workspace:typeof initialWorkspace;
  dispatch:React.Dispatch<Parameters<typeof workspaceReducer>[1]>;
  desk:ReturnType<typeof useSessions>;
  providers:Provider[];
  drafts:Drafts;
  setDrafts:React.Dispatch<React.SetStateAction<Drafts>>;
  onHelp:(id:string)=>void;
}) {
  const [ratio,setRatio]=useState(50);
  const splitRef=useRef<HTMLDivElement>(null);
  function resize(e:React.PointerEvent<HTMLDivElement>){
    const rect=splitRef.current?.getBoundingClientRect();if(!rect)return;
    const value=workspace.mode==='rows'?(e.clientY-rect.top)/rect.height:(e.clientX-rect.left)/rect.width;
    setRatio(Math.max(25,Math.min(75,value*100)));
  }
  return (
      <div ref={splitRef} className={`workspace ${workspace.mode}`}>
        {([0,1] as const).filter(p=>p===0||workspace.mode!=='single').map(p=>{
          const id=workspace.selected[p],session=desk.sessions.find(s=>s.id===id);
          const text=id?drafts[id]?.text??'':'';
          const canSend=!!session?.live&&!session.busy&&!session.resuming&&!session.changingAgent&&!session.changingModel&&!!text.trim();
          return <React.Fragment key={p}>
            {p===1&&<div className="pane-divider" role="separator" tabIndex={0} aria-label="Resize conversation panes" aria-orientation={workspace.mode==='rows'?'horizontal':'vertical'} aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio)}
              onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resize(e)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resize(e)}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
              onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home'].includes(e.key)){e.preventDefault();setRatio(r=>e.key==='Home'?50:Math.max(25,Math.min(75,r+(['ArrowLeft','ArrowUp'].includes(e.key)?-5:5))))}}}/>}
            <section aria-label={`Conversation pane ${p+1}`} className={`workspace-pane ${workspace.focus===p?'focused':''}`} style={{flex:`${workspace.mode==='single'?1:p===0?ratio:100-ratio} 1 0%`}} onFocusCapture={()=>dispatch({type:'focus',pane:p})} onPointerDown={()=>dispatch({type:'focus',pane:p})}>
              <div className="tabs" role="tablist" aria-label={`Pane ${p+1} conversations`}>{workspace.groups[p].map(tabId=>{
                const tab=desk.sessions.find(s=>s.id===tabId);if(!tab)return null;
                return <div className="session-tab" key={tabId}><button role="tab" aria-selected={tabId===id} className={tabId===id?'active':''} onClick={()=>dispatch({type:'select',pane:p,id:tabId})}>{chatTitle(tab)} {tab.busy?'◌':''}<small>{tab.provider}</small></button><button aria-label={`Close ${chatTitle(tab)}`} onClick={()=>void desk.close(tabId)}>×</button></div>;
              })}</div>
              {session&&id?<><div className="pane-actions"><button onClick={()=>dispatch({type:'move',id,pane:p===0?1:0})}>Move to other pane</button></div>
                <ErrorBoundary key={id} label={`${session.provider} conversation`}>
                  <SessionPane session={session} onHelp={()=>onHelp(id)} onModel={modelId=>void desk.setModel(id,modelId)} onAgent={agentId=>void desk.setAgent(id,agentId)} resumeAvailable={!!resumeProvider(providers,session)}
                    onResume={()=>{const provider=resumeProvider(providers,session);if(provider)void desk.resume(session,provider)}} onPermission={async(request,option)=>{await invoke('permission',{id,request,option})}} onCancel={()=>void desk.cancel(id)}>
                    <Composer text={text} onText={value=>setDrafts(d=>editDraft(d,id,value))} canSend={canSend} label={`Message to ${session.provider}`} onSend={()=>{if(canSend){const clearedRevision=(drafts[id]?.revision??0)+1;setDrafts(d=>editDraft(d,id,''));void desk.send([id],text).then(results=>{if(!results[0])setDrafts(d=>restoreDraft(d,id,text,clearedRevision))})}}}/>
                  </SessionPane>
                </ErrorBoundary></>:<div className="empty"><h2>{desk.sessions.length?'Choose a conversation':'A second perspective starts here.'}</h2><p>{workspace.mode==='single'?'Start a session or open a chat from history.':'Click this pane, then start a session or open a chat from history.'}</p></div>}
            </section>
          </React.Fragment>;
        })}
      </div>
  );
}
