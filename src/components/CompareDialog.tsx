import React,{useEffect,useRef,useState} from 'react';
import type {Provider} from '../types';
import {Composer} from './Composer';
export function CompareDialog({providers,onClose,onCompare}:{providers:Provider[];onClose:()=>void;onCompare:(text:string)=>void}){
  const [text,setText]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector('textarea')?.focus();
    return ()=>previous?.focus();
  },[]);
  return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();onClose()}
    if(e.key==='Tab'){
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('textarea,button:not(:disabled)')??[]);
      const first=elements[0],last=elements.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><h2 id="compare-title">Compare providers</h2><p>Start a fresh independent conversation with each configured provider: {providers.map(p=>p.name).join(', ')}.</p>
    <Composer text={text} onText={setText} label="Comparison prompt" sendLabel="Start comparison" canSend={!!text.trim()} onSend={()=>{if(text.trim())onCompare(text)}}/>
    <button onClick={onClose}>Cancel</button>
  </div></div>;
}
