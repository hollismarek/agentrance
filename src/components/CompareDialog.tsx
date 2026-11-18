import React,{useEffect,useRef,useState} from 'react';
import type {Attachment} from '../attachments';
import type {Provider} from '../types';
import {Composer} from './Composer';
export function CompareDialog({providers,onClose,onCompare}:{providers:Provider[];onClose:()=>void;onCompare:(text:string,attachments:Attachment[])=>void}){
  const [text,setText]=useState('');
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [loadingFiles,setLoadingFiles]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector('textarea')?.focus();
    return ()=>previous?.focus();
  },[]);
  return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();onClose()}
    if(e.key==='Tab'){
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('textarea,button:not(:disabled)')??[]).filter(el=>el.getClientRects().length>0);
      const first=elements[0],last=elements.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><h2 id="compare-title">Compare providers</h2><p>Start a fresh independent conversation with each configured provider: {providers.map(p=>p.name).join(', ')}.</p>
    <p className="muted">Attached images and files are sent to every provider. Each provider must support the selected file types.</p>
    <Composer attachments={attachments} onAttachments={setAttachments} onAttachmentBusy={setLoadingFiles} text={text} onText={setText} label="Comparison prompt" sendLabel="Start comparison" canSend={!loadingFiles&&(!!text.trim()||attachments.length>0)} onSend={()=>{if(!loadingFiles&&(text.trim()||attachments.length))onCompare(text,attachments)}}/>
    <button onClick={onClose}>Cancel</button>
  </div></div>;
}
