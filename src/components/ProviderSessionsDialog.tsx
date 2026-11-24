import React,{useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import type {Provider} from '../types';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';

type ListedSession={sessionId:string;title:string|null;updatedAt:string|null};
type SessionPage={sessions:ListedSession[];nextCursor:string|null};

export function ProviderSessionsDialog({providers,selected,workspaceProject,projects,onOpen,onClose}:{
  providers:Provider[];selected:string;workspaceProject?:string;projects:string[];
  onOpen:(provider:Provider,id:string,title:string|null)=>Promise<void>;
  onClose:()=>void;
}){
  const initial=providers.find(provider=>provider.id===selected)??providers[0];
  const [providerId,setProviderId]=useState(initial?.id??'');
  const provider=providers.find(candidate=>candidate.id===providerId);
  const [project,setProject]=useState(workspaceProject??initial?.cwd??'');
  const [page,setPage]=useState<SessionPage|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    panel.current?.querySelector('select')?.focus();
    return ()=>previous?.focus();
  },[]);
  function changeProject(path:string){
    setProject(path);setPage(null);setError('');
  }
  async function run(action:()=>Promise<void>){
    setBusy(true);setError('');
    try{await action()}catch(reason){setError(String(reason))}finally{setBusy(false)}
  }
  function list(cursor?:string){
    if(!provider||!absoluteProject(project.trim()))return;
    const configuration={...provider,cwd:project.trim()};
    void run(async()=>{
      const result=await invoke<SessionPage>('list_provider_sessions',{provider:configuration,cursor});
      setPage(current=>{
        const sessions=cursor&&current?[...current.sessions]:[];
        const seen=new Set(sessions.map(session=>session.sessionId));
        for(const entry of result.sessions){
          if(!seen.has(entry.sessionId)){sessions.push(entry);seen.add(entry.sessionId)}
        }
        return {sessions,nextCursor:result.nextCursor===cursor?null:result.nextCursor};
      });
    });
  }
  function openSession(session:ListedSession){
    if(!provider)return;
    void run(async()=>{
      await onOpen({...provider,cwd:project.trim()},session.sessionId,session.title);
      onClose();
    });
  }

  return <div className="overlay help-overlay"><div ref={panel} className="history-dialog backup-dialog" role="dialog"
    aria-modal="true" aria-labelledby="provider-sessions-title" onKeyDown={event=>{
      if(event.key==='Escape'&&!busy){event.preventDefault();onClose()}
      if(event.key!=='Tab')return;
      const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),select:not(:disabled),input:not(:disabled)',
      )??[]).filter(element=>element.getClientRects().length>0);
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus()}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus()}
    }}>
    <h2 id="provider-sessions-title">Open provider session</h2>
    <p>Choose the project where the conversation started. Close the original chat before opening it here.</p>
    <fieldset disabled={busy}>
      <label className="compare-mode">Provider
        <select value={providerId} onChange={event=>{
          const id=event.target.value;
          setProviderId(id);
          changeProject(workspaceProject??providers.find(candidate=>candidate.id===id)?.cwd??'');
        }}>
          {providers.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </label>
      <ProjectField value={project} onChange={changeProject} choices={projects}/>
      <button disabled={!provider||!absoluteProject(project.trim())} onClick={()=>list()}>Find sessions</button>
      {page&&<div className="provider-session-results">
        {page.sessions.length===0&&<p>No saved sessions found for this project.</p>}
        {page.sessions.length>0&&<ul>{page.sessions.map((session)=>{
          const updated=session.updatedAt?new Date(session.updatedAt):null;
          return <li key={session.sessionId}>
            <button onClick={()=>openSession(session)}>
              <span>{session.title||session.sessionId}</span>
              {updated&&!Number.isNaN(updated.valueOf())&&<small>{updated.toLocaleString()}</small>}
            </button>
          </li>;
        })}</ul>}
        {page.nextCursor&&<button onClick={()=>list(page.nextCursor!)}>Load more sessions</button>}
      </div>}
    </fieldset>
    {busy&&<p role="status">Contacting provider…</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="dialog-actions"><button disabled={busy} onClick={onClose}>Close</button></div>
  </div></div>;
}
