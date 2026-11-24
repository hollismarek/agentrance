import React,{useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {MAX_WORKSPACE_NAME,workspaceNameTaken,type NamedWorkspace} from '../namedWorkspaces';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';

export function WorkspaceDialog({entry,entries,projects,onSave,onClose,onDelete}:{
 entry?:NamedWorkspace;entries:NamedWorkspace[];projects:string[];
 onSave:(name:string,project:string)=>void;onClose:()=>void;onDelete?:()=>void;
}){
 const [name,setName]=useState(entry?.name??'');
 const [project,setProject]=useState(entry?.project??'');
 const [checking,setChecking]=useState(false);
 const [error,setError]=useState('');
 const [confirmDelete,setConfirmDelete]=useState(false);
 const deleteDestination=entry&&entries.find(candidate=>candidate.id!==entry.id);
 const hasTabs=entry?.layout?.groups.some(group=>group.length);
 const panel=useRef<HTMLFormElement>(null);
 const submitting=useRef(false);
 const path=project.trim();
 const duplicate=workspaceNameTaken(entries,name,entry?.id);
 const valid=!!name.trim()&&!duplicate&&(!path||absoluteProject(path));
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  return()=>previous?.focus();
 },[]);
 useEffect(()=>{
  panel.current?.querySelector<HTMLElement>(confirmDelete?'button':'input')?.focus();
 },[confirmDelete]);
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
 return <div className="overlay help-overlay"><form ref={panel} className="history-dialog workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title"
  onSubmit={e=>{e.preventDefault();if(!confirmDelete)void save()}} onKeyDown={e=>{
   if(e.key==='Escape'){
     e.preventDefault();
     if(confirmDelete)setConfirmDelete(false);
     else if(!submitting.current)onClose();
    }
   if(e.key==='Tab'){
    const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')??[]);
    if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}
    else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}
   }
  }}>
  {confirmDelete&&deleteDestination?<><h2 id="workspace-dialog-title">Delete {entry?.name}?</h2>
   <p>{hasTabs?<>Its open chats and drafts will move to <strong>{deleteDestination.name}</strong>.</>:
    <>You can find its saved chats in sidebar history.</>}</p>
   <div className="dialog-actions">
    <button type="button" onClick={()=>setConfirmDelete(false)}>Keep workspace</button>
    <button type="button" className="danger" onClick={onDelete}>Delete workspace</button>
   </div>
  </>:<><h2 id="workspace-dialog-title">{entry?'Edit workspace':'New workspace'}</h2>
  {!entry&&<p>This creates an empty workspace. To name the workspace you’re already using, use the pencil in the toolbar.</p>}
  <fieldset disabled={checking}>
   <label>Workspace name<input value={name} maxLength={MAX_WORKSPACE_NAME} aria-invalid={duplicate||undefined} aria-describedby={duplicate?'workspace-name-error':undefined} onChange={e=>setName(e.target.value)}/></label>
   {duplicate&&<p id="workspace-name-error" role="status" className="error">A workspace already uses that name.</p>}
   <ProjectField value={project} onChange={setProject} choices={projects}/>
   <p className="muted">Optional. Sets the initial folder for new sessions and comparisons.</p>
  </fieldset>
  {error&&<p role="alert" className="error">{error}</p>}
  <div className="dialog-actions">
   {deleteDestination&&onDelete&&<button type="button" className="danger" disabled={checking} onClick={()=>setConfirmDelete(true)}>Delete workspace…</button>}
   <button type="button" onClick={onClose} disabled={checking}>Cancel</button>
   <button className="primary" disabled={!valid||checking}>{checking?'Checking folder…':entry?'Save workspace':'Create workspace'}</button>
  </div></>}
 </form></div>;
}
