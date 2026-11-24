import React,{useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {MAX_WORKSPACE_NAME,type NamedWorkspace} from '../namedWorkspaces';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';

export function WorkspaceDialog({entry,projects,onSave,onClose}:{
 entry?:NamedWorkspace;projects:string[];
 onSave:(name:string,project:string)=>void;onClose:()=>void;
}){
 const [name,setName]=useState(entry?.name??'');
 const [project,setProject]=useState(entry?.project??'');
 const [checking,setChecking]=useState(false);
 const [error,setError]=useState('');
 const panel=useRef<HTMLFormElement>(null);
 const submitting=useRef(false);
 const path=project.trim();
 const valid=!!name.trim()&&(!path||absoluteProject(path));
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  panel.current?.querySelector('input')?.focus();
  return()=>previous?.focus();
 },[]);
 async function save(){
  if(!valid||submitting.current)return;
  setError('');
  submitting.current=true;
  setChecking(true);
  try{
   const canonical=path&&path!==entry?.project?await invoke<string>('validate_project',{path}):path;
   onSave(name.trim(),canonical);
  }catch(e){setError(String(e))}
  finally{submitting.current=false;setChecking(false)}
 }
 return <div className="overlay help-overlay"><form ref={panel} className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title"
  onSubmit={e=>{e.preventDefault();void save()}} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();if(!submitting.current)onClose()}
   if(e.key==='Tab'){
    const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')??[]);
    if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}
    else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}
   }
  }}>
  <h2 id="workspace-dialog-title">{entry?'Edit workspace':'New workspace'}</h2>
  <fieldset disabled={checking}>
   <label>Workspace name<input value={name} maxLength={MAX_WORKSPACE_NAME} onChange={e=>setName(e.target.value)}/></label>
   <ProjectField value={project} onChange={setProject} choices={projects}/>
   <p className="muted">Optional. Sets the initial folder for new sessions and comparisons.</p>
  </fieldset>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="dialog-actions">
   <button type="button" onClick={onClose} disabled={checking}>Cancel</button>
   <button className="primary" disabled={!valid||checking}>{checking?'Checking folder…':entry?'Save workspace':'Create workspace'}</button>
  </div>
 </form></div>;
}
