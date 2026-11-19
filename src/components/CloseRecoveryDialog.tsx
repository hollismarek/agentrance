import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
export function CloseRecoveryDialog({saving,error,onRetry,onKeepWorking,onQuit}:{saving:boolean;error:string;onRetry:()=>void;onKeepWorking:()=>void;onQuit:()=>void}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!saving&&!error)return;
  const previous=document.activeElement as HTMLElement|null;
  (panel.current?.querySelector<HTMLElement>('button')??panel.current)?.focus();
  return()=>{if(previous?.isConnected)previous.focus()};
 },[saving,error]);
 if(!saving&&!error)return null;
 return createPortal(<div className="overlay close-recovery-overlay" onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!saving)onKeepWorking()}
  if(e.key==='Tab'){
   const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('button')??[]);
   const first=controls[0],last=controls.at(-1);
   if(!first){e.preventDefault();panel.current?.focus()}
   else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
 }}><div ref={panel} tabIndex={-1} className="history-dialog" role={saving?'dialog':'alertdialog'} aria-modal="true" aria-labelledby="close-recovery-title" aria-describedby="close-recovery-description">
  <h2 id="close-recovery-title">{saving?'Saving workspace…':'Workspace could not be saved'}</h2>
  <p id="close-recovery-description">{saving?'The app will close when the latest recovery save finishes.':error}</p>
  {!saving&&<div className="dialog-actions"><button onClick={onRetry}>Retry save and quit</button><button onClick={onKeepWorking}>Keep working</button><button onClick={onQuit}>Quit without saving</button></div>}
 </div></div>,document.body);
}
