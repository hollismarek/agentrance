import React,{useEffect,useRef,useState} from 'react';
import type {Provider} from '../types';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
export function NewSessionDialog({provider,initialProject,projects,onClose,onStart}:{provider:Provider;initialProject:string;projects:string[];onClose:()=>void;onStart:(cwd:string)=>void}){
 const [project,setProject]=useState(initialProject);
 const panel=useRef<HTMLFormElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector('input')?.focus();return()=>previous?.focus()},[]);
 return <div className="overlay help-overlay"><form ref={panel} className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="new-session-title" onSubmit={e=>{e.preventDefault();if(absoluteProject(project.trim()))onStart(project.trim())}} onKeyDown={e=>{
  if(e.key==='Escape'){e.preventDefault();onClose()}
  if(e.key==='Tab'){
   const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('input,button:not(:disabled)')??[]);
   const first=controls[0],last=controls.at(-1);
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
 }}><h2 id="new-session-title">New session with {provider.name}</h2>
  <ProjectField value={project} onChange={setProject} choices={projects}/>
  <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={!absoluteProject(project.trim())}>Start session</button></div>
 </form></div>;
}
