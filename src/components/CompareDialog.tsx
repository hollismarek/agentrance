import React,{useEffect,useRef,useState} from 'react';
import type {Attachment} from '../attachments';
import type {Provider} from '../types';
import {Composer} from './Composer';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
import {invoke} from '@tauri-apps/api/core';
export function CompareDialog({providers,onClose,onCompare,initialProject='',projects=[]}:{providers:Provider[];onClose:()=>void;onCompare:(text:string,attachments:Attachment[],cwd:string)=>void;initialProject?:string;projects?:string[]}){
  const [text,setText]=useState('');
  const [project,setProject]=useState(initialProject);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [loadingFiles,setLoadingFiles]=useState(false);
  const [checking,setChecking]=useState(false),[error,setError]=useState('');
  const submitting=useRef(false);
  async function compare(){
    if(submitting.current||loadingFiles||!absoluteProject(project.trim())||(!text.trim()&&!attachments.length))return;
    submitting.current=true;setChecking(true);setError('');
    try{const cwd=await invoke<string>('validate_project',{path:project.trim()});onCompare(text,attachments,cwd)}
    catch(e){setError(String(e))}finally{submitting.current=false;setChecking(false)}
  }
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLElement>(initialProject?'textarea':'input')?.focus();
    return ()=>previous?.focus();
  },[]);
  return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();if(!submitting.current)onClose()}
    if(e.key==='Tab'){
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('input:not([type="file"]):not(:disabled),textarea:not(:disabled),button:not(:disabled)')??[]).filter(el=>el.getClientRects().length>0);
      const first=elements[0],last=elements.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><h2 id="compare-title">Compare providers</h2><p>Start a fresh independent conversation with each configured provider: {providers.map(p=>p.name).join(', ')}.</p>
    <fieldset disabled={checking}><ProjectField value={project} onChange={setProject} choices={projects}/></fieldset>
    <p className="muted">Every provider will use this same project folder for this comparison.</p>
    <p className="muted">Providers share the working tree. Changes made by one can affect the others; use read-only review instructions when comparing reviews.</p>
    <p className="muted">Attached images and files are sent to every provider. Each provider must support the selected file types.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    <fieldset disabled={checking}><Composer attachments={attachments} onAttachments={setAttachments} onAttachmentBusy={setLoadingFiles} text={text} onText={setText} label="Comparison prompt" sendLabel={checking?'Checking project…':'Start comparison'} canSend={!checking&&absoluteProject(project.trim())&&!loadingFiles&&(!!text.trim()||attachments.length>0)} onSend={()=>void compare()}/></fieldset>
    <button disabled={checking} onClick={onClose}>Cancel</button>
  </div></div>;
}
