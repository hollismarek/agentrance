import React,{useEffect,useRef,useState} from 'react';
import type {Attachment} from '../attachments';
import type {Provider} from '../types';
import {Composer} from './Composer';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
export function CompareDialog({providers,onClose,onCompare,initialProject='',projects=[]}:{providers:Provider[];onClose:()=>void;onCompare:(text:string,attachments:Attachment[],cwd:string)=>void;initialProject?:string;projects?:string[]}){
  const [text,setText]=useState('');
  const [project,setProject]=useState(initialProject);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [loadingFiles,setLoadingFiles]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLElement>(initialProject?'textarea':'input')?.focus();
    return ()=>previous?.focus();
  },[]);
  return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();onClose()}
    if(e.key==='Tab'){
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('input:not([type="file"]),textarea,button:not(:disabled)')??[]).filter(el=>el.getClientRects().length>0);
      const first=elements[0],last=elements.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><h2 id="compare-title">Compare providers</h2><p>Start a fresh independent conversation with each configured provider: {providers.map(p=>p.name).join(', ')}.</p>
    <ProjectField value={project} onChange={setProject} choices={projects}/>
    <p className="muted">Every provider will use this same project folder for this comparison.</p>
    <p className="muted">Attached images and files are sent to every provider. Each provider must support the selected file types.</p>
    <Composer attachments={attachments} onAttachments={setAttachments} onAttachmentBusy={setLoadingFiles} text={text} onText={setText} label="Comparison prompt" sendLabel="Start comparison" canSend={absoluteProject(project.trim())&&!loadingFiles&&(!!text.trim()||attachments.length>0)} onSend={()=>{if(absoluteProject(project.trim())&&!loadingFiles&&(text.trim()||attachments.length))onCompare(text,attachments,project.trim())}}/>
    <button onClick={onClose}>Cancel</button>
  </div></div>;
}
