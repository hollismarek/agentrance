import React,{useEffect,useRef,useState} from 'react';
import type {Provider} from '../types';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
import {invoke} from '@tauri-apps/api/core';
export function NewSessionDialog({providers,selected,workspaceProject,projects,onClose,onStart}:{
 providers:Provider[];selected:string;workspaceProject?:string;projects:string[];
 onClose:()=>void;onStart:(provider:Provider,cwd:string)=>void;
}){
 const [providerId,setProviderId]=useState(selected);
 const provider=providers.find(candidate=>candidate.id===providerId)??providers[0];
 const [customProject,setCustomProject]=useState<string|null>(null);
 const project=customProject??workspaceProject??provider?.cwd??'';
 const canStart=!!provider&&absoluteProject(project.trim());
 const [checking,setChecking]=useState(false),[error,setError]=useState('');
 const submitting=useRef(false);
 async function start(){
  if(submitting.current||!provider||!canStart)return;
  submitting.current=true;setChecking(true);setError('');
  try{const cwd=await invoke<string>('validate_project',{path:project.trim()});onStart(provider,cwd)}
  catch(e){setError(String(e))}finally{submitting.current=false;setChecking(false)}
 }
 const panel=useRef<HTMLFormElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector('select')?.focus();return()=>previous?.focus()},[]);
 return <div className="overlay help-overlay"><form ref={panel} className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="new-session-title" onSubmit={e=>{e.preventDefault();void start()}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();if(!submitting.current)onClose()}
  if(e.key==='Tab'){
   const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('select:not(:disabled),input:not(:disabled),button:not(:disabled)')??[]);
   const first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 }}><h2 id="new-session-title">New session</h2>
  <fieldset disabled={checking}>
   <label className="compare-mode">Provider
    <select value={provider?.id??''} disabled={!provider} onChange={e=>{setProviderId(e.target.value);setError('')}}>
     {providers.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
    </select>
   </label>
   <ProjectField value={project} onChange={path=>{setCustomProject(path);setError('')}} choices={projects}/>
  </fieldset>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="dialog-actions"><button type="button" disabled={checking} onClick={onClose}>Cancel</button><button className="primary" disabled={checking||!canStart}>{checking?'Checking project…':'Start session'}</button></div>
 </form></div>;
}
