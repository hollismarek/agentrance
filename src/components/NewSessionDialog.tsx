import React,{useEffect,useRef,useState} from 'react';
import type {Provider} from '../types';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
import {invoke} from '@tauri-apps/api/core';
export function NewSessionDialog({provider,initialProject,projects,onClose,onStart}:{provider:Provider;initialProject:string;projects:string[];onClose:()=>void;onStart:(cwd:string)=>void}){
 const [project,setProject]=useState(initialProject);
 const [checking,setChecking]=useState(false),[error,setError]=useState('');
 const submitting=useRef(false);
 async function start(){
  if(submitting.current||!absoluteProject(project.trim()))return;
  submitting.current=true;setChecking(true);setError('');
  try{const cwd=await invoke<string>('validate_project',{path:project.trim()});onStart(cwd)}
  catch(e){setError(String(e))}finally{submitting.current=false;setChecking(false)}
 }
 const panel=useRef<HTMLFormElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector('input')?.focus();return()=>previous?.focus()},[]);
 return <div className="overlay help-overlay"><form ref={panel} className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="new-session-title" onSubmit={e=>{e.preventDefault();void start()}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();if(!submitting.current)onClose()}
  if(e.key==='Tab'){
   const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')??[]);
   const first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 }}><h2 id="new-session-title">New session with {provider.name}</h2>
  <fieldset disabled={checking}><ProjectField value={project} onChange={setProject} choices={projects}/></fieldset>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="dialog-actions"><button type="button" disabled={checking} onClick={onClose}>Cancel</button><button className="primary" disabled={checking||!absoluteProject(project.trim())}>{checking?'Checking project…':'Start session'}</button></div>
 </form></div>;
}
