import React,{useEffect,useRef,useState} from 'react';
import type {Attachment} from '../attachments';
import type {Provider,Session} from '../types';
import {chatTitle} from '../history';
import {comparisonUnavailable} from '../compareTargets';
import {Composer} from './Composer';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
import {invoke} from '@tauri-apps/api/core';
type Mode='all'|'selected'|'existing';
type Props={
  providers:Provider[];
  sessions?:Session[];
  onClose:()=>void;
  onCompare:(text:string,attachments:Attachment[],cwd:string,providers:Provider[])=>void;
  onExisting?:(text:string,attachments:Attachment[],ids:string[])=>void;
  initialProject?:string;
  projects?:string[];
};
export function CompareDialog({providers,sessions=[],onClose,onCompare,onExisting,initialProject='',projects=[]}:Props){
  const [mode,setMode]=useState<Mode>('all');
  const [providerIds,setProviderIds]=useState<string[]>([]);
  const [sessionIds,setSessionIds]=useState<string[]>([]);
  const [text,setText]=useState('');
  const [project,setProject]=useState(initialProject);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [loadingFiles,setLoadingFiles]=useState(false);
  const [checking,setChecking]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false);
  const existing=mode==='existing';
  const freshProviders=mode==='all'?providers:providers.filter(provider=>providerIds.includes(provider.id));
  const eligible=sessions.filter(session=>!comparisonUnavailable(session));
  const recipients=eligible.filter(session=>sessionIds.includes(session.id));
  const unavailableSelected=recipients.length!==sessionIds.length;
  const missingIds=sessionIds.filter(id=>!sessions.some(session=>session.id===id));
  const hasTargets=existing?!!onExisting&&recipients.length>0&&!unavailableSelected:freshProviders.length>0&&absoluteProject(project.trim());
  const canSend=hasTargets&&!loadingFiles&&(!!text.trim()||attachments.length>0);
  function toggle(ids:string[],id:string,checked:boolean){
    return checked?[...ids,id]:ids.filter(value=>value!==id);
  }
  async function compare(){
    if(submitting.current||!canSend)return;
    if(existing){
      onExisting?.(text,attachments,recipients.map(session=>session.id));
      return;
    }
    submitting.current=true;setChecking(true);setError('');
    try{const cwd=await invoke<string>('validate_project',{path:project.trim()});onCompare(text,attachments,cwd,freshProviders)}
    catch(e){setError(String(e))}finally{submitting.current=false;setChecking(false)}
  }
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLElement>('select')?.focus();
    return ()=>previous?.focus();
  },[]);
  return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();if(!submitting.current)onClose()}
    if(e.key==='Tab'){
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('select:not(:disabled),input:not([type="file"]):not(:disabled),textarea:not(:disabled),button:not(:disabled)')??[]).filter(el=>el.getClientRects().length>0);
      const first=elements[0],last=elements.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><h2 id="compare-title">Compare</h2>
    <fieldset disabled={checking}>
      <label className="compare-mode">Recipients
        <select value={mode} onChange={e=>{setMode(e.target.value as Mode);setError('')}}>
          <option value="all">New sessions for all providers</option>
          <option value="selected">New sessions for selected providers</option>
          <option value="existing">Existing sessions</option>
        </select>
      </label>
      {mode==='all'&&<p className="muted">{providers.map(provider=>provider.name).join(', ')}</p>}
      {mode==='selected'&&<div className="compare-targets" role="group" aria-label="Providers">
        {providers.map(provider=><label key={provider.id}><input type="checkbox" checked={providerIds.includes(provider.id)} onChange={e=>setProviderIds(toggle(providerIds,provider.id,e.target.checked))}/>{provider.name}</label>)}
      </div>}
      {existing?<><div className="compare-targets" role="group" aria-label="Existing sessions">
        <label><input type="checkbox" disabled={!eligible.length} checked={eligible.length>0&&recipients.length===eligible.length&&!unavailableSelected}
          onChange={e=>setSessionIds(e.target.checked?eligible.map(session=>session.id):[])}/>Select all available sessions</label>
        {sessions.map(session=>{
          const unavailable=comparisonUnavailable(session);
          const selected=sessionIds.includes(session.id);
          return <label key={session.id}>
            <input type="checkbox" disabled={!!unavailable&&!selected} checked={selected}
              onChange={e=>setSessionIds(toggle(sessionIds,session.id,e.target.checked))}/>
            <span>{chatTitle(session)} · {session.provider}<small>{session.cwd}{unavailable&&` · ${unavailable}`}</small></span>
          </label>;
        })}
        {missingIds.length>0&&<button type="button" onClick={()=>setSessionIds(ids=>ids.filter(id=>!missingIds.includes(id)))}>
          Remove {missingIds.length===1?'closed session':`${missingIds.length} closed sessions`}
        </button>}
        {unavailableSelected&&<p role="status">Some selected sessions are unavailable. Deselect them or wait until they are ready.</p>}
      </div><p className="muted">{eligible.length?'Each session keeps its current project and conversation history.':'Open or continue a session and wait until it is idle.'}</p></>:<>
        <ProjectField value={project} onChange={setProject} choices={projects}/>
        <p className="muted">Every provider will use this same project folder for this comparison.</p>
      </>}
    </fieldset>
    <p className="muted">Sessions in the same project share a working tree, so changes by one can affect the others.</p>
    <p className="muted">Attached images and files are sent to every provider. Each provider must support the selected file types.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    <fieldset disabled={checking}><Composer attachments={attachments} onAttachments={setAttachments} onAttachmentBusy={setLoadingFiles} text={text} onText={setText} label="Comparison prompt" sendLabel={checking?'Checking project…':'Start comparison'} canSend={!checking&&canSend} onSend={()=>void compare()}
      secondaryAction={<button type="button" disabled={checking} onClick={onClose}>Cancel</button>}/></fieldset>
  </div></div>;
}
