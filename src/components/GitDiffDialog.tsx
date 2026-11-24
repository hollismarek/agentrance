import React,{memo,useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';

type Source='staged'|'unstaged'|'commit';
type Request={path:string;source:Source;revision?:string};
type ChangedFile={status:string;path:string};
type DiffFiles={cwd:string;commit:string|null;files:ChangedFile[]};
const statusNames:Record<string,string>={A:'Added',D:'Deleted',M:'Modified',T:'Type changed',U:'Unmerged'};

const Patch=memo(function Patch({text}:{text:string}){
 const limit=5000;
 const lines=text.replace(/\n$/, '').split('\n',limit+1);
 let inHunk=false;
 return <>
  <pre className="git-patch" tabIndex={0} aria-label="Unified diff">{lines.slice(0,limit).map((line,index)=>{
   const hunk=line.startsWith('@@');
   if(hunk)inHunk=true;
   if(line.startsWith('diff --git '))inHunk=false;
   const kind=hunk?'hunk':inHunk&&line.startsWith('+')?'added':inHunk&&line.startsWith('-')?'removed':undefined;
   return <span key={index} data-kind={kind}>{line}{'\n'}</span>;
  })}</pre>
  {lines.length>limit&&<p role="status">Showing the first {limit.toLocaleString()} lines of this diff.</p>}
 </>;
});

export default function GitDiffDialog({initialProject,projects,onClose}:{
 initialProject:string;projects:string[];onClose:()=>void;
}){
 const [project,setProject]=useState(initialProject);
 const [source,setSource]=useState<Source>('unstaged');
 const [revision,setRevision]=useState('HEAD');
 const [request,setRequest]=useState<Request|null>(()=>absoluteProject(initialProject)?{path:initialProject,source:'unstaged'}:null);
 const [result,setResult]=useState<DiffFiles|null>(null);
 const [file,setFile]=useState('');
 const [patch,setPatch]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [patchError,setPatchError]=useState('');
 const dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLSelectElement>('select')?.focus();
  return()=>{if(previous?.isConnected)previous.focus()};
 },[]);
 useEffect(()=>{
  if(!request)return;
  let active=true;
  void invoke<DiffFiles>('git_diff_files',request).then(report=>{
   if(!active)return;
   setResult(report);
   setFile(report.files[0]?.path??'');
  }).catch(reason=>{if(active)setError(String(reason))});
  return()=>{active=false};
 },[request]);
 useEffect(()=>{
  if(!request||!result||!file)return;
  let active=true;
  void invoke<string>('git_diff_file',{path:result.cwd,source:request.source,commit:result.commit,file})
   .then(text=>{if(active)setPatch(text)})
   .catch(reason=>{if(active)setPatchError(String(reason))});
  return()=>{active=false};
 },[request,result,file]);
 function selectFile(path:string){
  if(path===file)return;
  setFile(path);setPatch(null);setPatchError('');
 }
 function load(next:Request|null){
  setRequest(next);setResult(null);setFile('');setPatch(null);setError('');setPatchError('');
 }
 const path=project.trim();
 const canLoad=absoluteProject(path);
 return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog git-diff-dialog" role="dialog" aria-modal="true" aria-labelledby="git-diff-title" onKeyDown={event=>{
  if(event.key==='Escape'){event.preventDefault();onClose()}
  if(event.key==='Tab'){
   const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')??[]);
   if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus()}
   if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus()}
  }
 }}>
  <div className="git-diff-heading"><h2 id="git-diff-title">Git diff</h2><button type="button" onClick={onClose}>Close</button></div>
  <form onSubmit={event=>{event.preventDefault();if(canLoad)load({path,source,revision})}}>
   <ProjectField value={project} onChange={value=>{setProject(value);load(null)}} choices={projects}/>
   <div className="git-diff-controls">
    <label>Changes <select value={source} onChange={event=>{
     const next=event.target.value as Source;
     setSource(next);
     load(canLoad&&next!=='commit'?{path,source:next}:null);
    }}>
     <option value="unstaged">Unstaged</option>
     <option value="staged">Staged</option>
     <option value="commit">Commit</option>
    </select></label>
    {source==='commit'&&<label>Commit or ref <input value={revision} onChange={event=>{setRevision(event.target.value);load(null)}} placeholder="HEAD" maxLength={1024}/></label>}
    <button type="submit" disabled={!canLoad}>{result?'Refresh':'Load diff'}</button>
   </div>
  </form>
  {request&&!result&&!error&&<p role="status">Loading changed files…</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {result?.commit&&<p className="git-diff-commit">Commit <code>{result.commit}</code></p>}
  {result&&!result.files.length&&<p role="status">No changes in this view.</p>}
  {!!result?.files.length&&<div className="git-diff-grid">
   <nav className="git-diff-files" aria-label="Changed files">{result.files.map(entry=><button key={entry.path} type="button" aria-current={entry.path===file?'true':undefined} title={entry.path} onClick={()=>selectFile(entry.path)}>
    {entry.path}<small>{statusNames[entry.status]??'Changed'}</small>
   </button>)}</nav>
   <section className="git-diff-file" aria-label="File diff">
    <h3>{file}</h3>
    {patchError?<p role="alert" className="error">{patchError}</p>:patch===null?<p role="status">Loading file diff…</p>:
     patch?<Patch text={patch}/>:<p role="status">{source==='commit'?'No patch available for this file in the selected commit.':'No patch available. Refresh if the index or working tree changed.'}</p>}
   </section>
  </div>}
 </div></div>;
}
