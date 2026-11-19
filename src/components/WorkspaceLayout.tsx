import React, {useEffect,useRef,useState} from 'react';
import {pendingReadCount} from '../attachmentReads';
import {invoke} from '@tauri-apps/api/core';
import {resumeProvider} from '../providers';
import type {Provider} from '../types';
import type {useSessions} from '../useSessions';
import {initialWorkspace,workspaceReducer,paneCount} from '../workspace';
import {editDraft,clearRecordedDraft,setAttachments,type Drafts} from '../drafts';
import {chatTitle} from '../history';
import {SessionPane} from './SessionPane';
import {Composer} from './Composer';
import {ErrorBoundary} from './ErrorBoundary';
import type {TranscriptPositions} from '../useTranscriptScroll';
import {ConversationTab} from './ConversationTab';

export function WorkspaceLayout({workspace,dispatch,desk,providers,drafts,setDrafts,onHelp}:{
  workspace:typeof initialWorkspace;
  dispatch:React.Dispatch<Parameters<typeof workspaceReducer>[1]>;
  desk:ReturnType<typeof useSessions>;
  providers:Provider[];
  drafts:Drafts;
  setDrafts:React.Dispatch<React.SetStateAction<Drafts>>;
  onHelp:(id:string)=>void;
}) {
  const [fileLoading,setFileLoading]=useState<Record<string,number>>({});
  const scrollPositions=useRef<TranscriptPositions>(new Map());
  useEffect(()=>{for(const id of scrollPositions.current.keys())if(!desk.sessions.some(s=>s.id===id))scrollPositions.current.delete(id)},[desk.sessions]);
  const [maximized,setMaximized]=useState(false);
  const count=paneCount(workspace.mode);
  const focusedPane=maximized?workspace.focus:null;
  useEffect(()=>setMaximized(false),[workspace.mode]);
  const paneIndices=Array.from({length:count},(_,i)=>i).filter(p=>focusedPane===null||p===focusedPane);
  const [ratio,setRatio]=useState(50);
  const splitRef=useRef<HTMLDivElement>(null);
  function resize(e:React.PointerEvent<HTMLDivElement>){
    const rect=splitRef.current?.getBoundingClientRect();if(!rect)return;
    const value=workspace.mode==='rows'?(e.clientY-rect.top)/rect.height:(e.clientX-rect.left)/rect.width;
    setRatio(Math.max(25,Math.min(75,value*100)));
  }
  return (
      <div className="workspace-frame"><div ref={splitRef} className={`workspace ${focusedPane!==null?'single':workspace.mode} ${count>2&&focusedPane===null?'multi':''}`}>
        {paneIndices.map(p=>{
          const id=workspace.selected[p],session=desk.sessions.find(s=>s.id===id);
          const text=id?drafts[id]?.text??'':'';
          const canSend=!fileLoading[id??'']&&!!session?.live&&!session.busy&&!session.resuming&&!session.changingAgent&&!session.changingModel&&(!!text.trim()||!!drafts[id??'']?.attachments?.length);
          return <React.Fragment key={p}>
            {count===2&&focusedPane===null&&p===1&&<div className="pane-divider" role="separator" tabIndex={0} aria-label="Resize conversation panes" aria-orientation={workspace.mode==='rows'?'horizontal':'vertical'} aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio)}
              onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resize(e)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resize(e)}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
              onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home'].includes(e.key)){e.preventDefault();setRatio(r=>e.key==='Home'?50:Math.max(25,Math.min(75,r+(['ArrowLeft','ArrowUp'].includes(e.key)?-5:5))))}}}/>}
            <section aria-label={`Conversation pane ${p+1}`} className={`workspace-pane ${workspace.focus===p?'focused':''}`} style={{flex:`${count!==2||focusedPane!==null?1:p===0?ratio:100-ratio} 1 0%`}} onFocusCapture={()=>dispatch({type:'focus',pane:p})} onPointerDown={()=>dispatch({type:'focus',pane:p})}>
              <div className="tabs" role="tablist" aria-label={`Pane ${p+1} conversations`}>{workspace.groups[p].map(tabId=>{
                const tab=desk.sessions.find(s=>s.id===tabId);if(!tab)return null;
                return <ConversationTab key={tabId} session={tab} selected={tabId===id} onSelect={()=>dispatch({type:'select',pane:p,id:tabId})} onClose={()=>void desk.close(tabId)}/>;
              })}</div>
              <div className="pane-actions"><span className="pane-number">Pane {p+1}</span>
                {count>1&&<button aria-pressed={maximized} onClick={()=>setMaximized(value=>!value)}>{!maximized?'Focus pane':'Show all panes'}</button>}
                {session&&id&&<select aria-label={`Move conversation from pane ${p+1}`} value="" onChange={e=>{dispatch({type:'move',id,pane:Number(e.target.value)});setMaximized(false)}}><option value="" disabled>Move to…</option>{Array.from({length:Math.max(2,count)},(_,i)=>i).filter(i=>i!==p).map(i=><option key={i} value={i}>Pane {i+1}</option>)}</select>}
              </div>
              {session&&id?<>
                <ErrorBoundary key={id} label={`${session.provider} conversation`}>
                  <SessionPane scrollPositions={scrollPositions.current} session={session} onHelp={()=>onHelp(id)} onModel={modelId=>void desk.setModel(id,modelId)} onAgent={agentId=>void desk.setAgent(id,agentId)} resumeAvailable={!!resumeProvider(providers,session)}
                    onResume={()=>{const provider=resumeProvider(providers,session);if(provider)void desk.resume(session,provider)}} onPermission={async(request,option)=>{await invoke('permission',{id,request,option})}} onCancel={()=>void desk.cancel(id)}>
                    {!!drafts[id]?.missingAttachments?.length&&<p className="draft-recovery" role="status">Attachments were not restored: {drafts[id].missingAttachments!.join(', ')}. Reattach them before sending. <button onClick={()=>setDrafts(all=>({...all,[id]:{...all[id],missingAttachments:[]}}))}>Dismiss</button></p>}
                    <Composer onAttachmentBusy={busy=>setFileLoading(all=>{const next={...all};const count=pendingReadCount(next[id]??0,busy);if(count)next[id]=count;else delete next[id];return next})} attachments={drafts[id]?.attachments??[]} onAttachments={files=>setDrafts(d=>setAttachments(d,id,files))} text={text} onText={value=>setDrafts(d=>editDraft(d,id,value))} canSend={canSend} label={`Message to ${session.provider}`} onSend={()=>{if(canSend){const revision=drafts[id]?.revision??0;const attachments=drafts[id]?.attachments??[];void desk.send([id],text,attachments,{},[],()=>setDrafts(d=>clearRecordedDraft(d,id,revision)))}}}/>
                  </SessionPane>
                </ErrorBoundary></>:<div className="empty"><h2>{desk.sessions.length?'Choose a conversation':'A second perspective starts here.'}</h2><p>{workspace.mode==='single'?'Start a session or open a chat from history.':'Click this pane, then start a session or open a chat from history.'}</p></div>}
            </section>
          </React.Fragment>;
        })}
      </div></div>
  );
}
