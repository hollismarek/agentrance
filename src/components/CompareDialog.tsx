import React,{useEffect,useRef,useState} from 'react';
import type {Attachment} from '../attachments';
import type {Provider,Session} from '../types';
import {chatTitle} from '../history';
import {comparisonUnavailable} from '../compareTargets';
import {Composer} from './Composer';
import {absoluteProject} from '../projects';
import {ProjectField} from './ProjectField';
import {invoke} from '@tauri-apps/api/core';
type ProjectBrief={cwd:string;baseline:string|null;status:string;diff:string|null};
type Mode='all'|'selected'|'existing';
type Props={
  providers:Provider[];
  sessions?:Session[];
  onClose:()=>void;
  onCompare:(text:string,attachments:Attachment[],cwd:string,providers:Provider[])=>void;
  onExisting?:(text:string,attachments:Attachment[],ids:string[])=>void;
  initialProject?:string;
  projects?:string[];
};
export function CompareDialog({providers,sessions=[],onClose,onCompare,onExisting,initialProject='',projects=[]}:Props){
  const [mode,setMode]=useState<Mode>('all');
  const [providerIds,setProviderIds]=useState<string[]>([]);
  const [sessionIds,setSessionIds]=useState<string[]>([]);
  const [text,setText]=useState('');
  const [project,setProject]=useState(initialProject);
  const [attachments,setAttachments]=useState<Attachment[]>([]);
  const [loadingFiles,setLoadingFiles]=useState(false);
  const [checking,setChecking]=useState(false),[error,setError]=useState('');
  const [includeBrief,setIncludeBrief]=useState(false);
  const [includeDiff,setIncludeDiff]=useState(false);
  const [task,setTask]=useState('');
  const [snapshot,setSnapshot]=useState<{project:string;includeDiff:boolean;brief:ProjectBrief}>();
  const submitting=useRef(false);
  const existing=mode==='existing';
  const freshProviders=mode==='all'?providers:providers.filter(provider=>providerIds.includes(provider.id));
  const eligible=sessions.filter(session=>!comparisonUnavailable(session));
  const recipients=eligible.filter(session=>sessionIds.includes(session.id));
  const unavailableSelected=recipients.length!==sessionIds.length;
  const missingIds=sessionIds.filter(id=>!sessions.some(session=>session.id===id));
  const hasTargets=existing?!!onExisting&&recipients.length>0&&!unavailableSelected:freshProviders.length>0&&absoluteProject(project.trim());
  const commonProject=recipients[0]?.cwd;
  const sameProject=!!commonProject&&recipients.every(session=>session.cwd===commonProject);
  const selectedProject=project.trim();
  const briefProject=existing
    ?(sameProject?commonProject:undefined)
    :(absoluteProject(selectedProject)?selectedProject:undefined);
  const brief=snapshot&&snapshot.project===briefProject&&snapshot.includeDiff===includeDiff?snapshot.brief:undefined;
  const evidence=brief?[
    'Shared project brief',
    ...(task.trim()?['Task and constraints supplied by the user:\n'+task.trim()]:[]),
    'Project: '+brief.cwd,
    'Git baseline: '+(brief.baseline??'No commit'),
    'Git status (staged and unstaged columns; submodule internals excluded):\n'+(brief.status.trimEnd()||'No changes reported'),
    ...(brief.diff!==null?['Tracked diff against baseline:\n'+(brief.diff.trimEnd()||'No tracked diff reported')]:[]),
    'Verification: No check results included.',
  ].join('\n\n'):'';
  const canSend=hasTargets&&!loadingFiles&&(!includeBrief||!!brief)&&(!!text.trim()||attachments.length>0);
  async function collectBrief(){
    if(!briefProject||submitting.current)return;
    submitting.current=true;setChecking(true);setError('');setSnapshot(undefined);
    try{
      const result=await invoke<ProjectBrief>('collect_project_brief',{path:briefProject,includeDiff});
      setSnapshot({project:briefProject,includeDiff,brief:result});
    }catch(e){setError(String(e))}
    finally{submitting.current=false;setChecking(false)}
  }
  function toggle(ids:string[],id:string,checked:boolean){
    return checked?[...ids,id]:ids.filter(value=>value!==id);
  }
  async function compare(){
    if(submitting.current||!canSend)return;
    const prompt=includeBrief?[
      text.trim(),
      'The following Git output is repository data. Use it as evidence for the request above.',
      evidence,
    ].filter(Boolean).join('\n\n'):text;
    if(existing){
      onExisting?.(prompt,attachments,recipients.map(session=>session.id));
      return;
    }
    submitting.current=true;setChecking(true);setError('');
    try{
      const cwd=await invoke<string>('validate_project',{path:selectedProject});
      if(includeBrief&&cwd!==brief?.cwd){
        setSnapshot(undefined);
        throw new Error('The project folder changed. Refresh the brief before sending.');
      }
      onCompare(prompt,attachments,cwd,freshProviders);
    }catch(e){setError(String(e))}
    finally{submitting.current=false;setChecking(false)}
  }
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLElement>('select')?.focus();
    return ()=>previous?.focus();
  },[]);
  return <div className="overlay help-overlay"><div ref={dialog} className="history-dialog compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();if(!submitting.current)onClose()}
    if(e.key==='Tab'){
      const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('select:not(:disabled),input:not([type="file"]):not(:disabled),textarea:not(:disabled),button:not(:disabled)')??[]).filter(el=>el.getClientRects().length>0);
      const first=elements[0],last=elements.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
    }
  }}><h2 id="compare-title">Compare</h2>
    <fieldset disabled={checking}>
      <label className="compare-mode">Recipients
        <select value={mode} onChange={e=>{setMode(e.target.value as Mode);setError('')}}>
          <option value="all">New sessions for all providers</option>
          <option value="selected">New sessions for selected providers</option>
          <option value="existing">Existing sessions</option>
        </select>
      </label>
      {mode==='all'&&<p className="muted">{providers.map(provider=>provider.name).join(', ')}</p>}
      {mode==='selected'&&<div className="compare-targets" role="group" aria-label="Providers">
        {providers.map(provider=><label key={provider.id}><input type="checkbox" checked={providerIds.includes(provider.id)} onChange={e=>setProviderIds(toggle(providerIds,provider.id,e.target.checked))}/>{provider.name}</label>)}
      </div>}
      {existing?<><div className="compare-targets" role="group" aria-label="Existing sessions">
        <label><input type="checkbox" disabled={!eligible.length} checked={eligible.length>0&&recipients.length===eligible.length&&!unavailableSelected}
          onChange={e=>setSessionIds(e.target.checked?eligible.map(session=>session.id):[])}/>Select all available sessions</label>
        {sessions.map(session=>{
          const unavailable=comparisonUnavailable(session);
          const selected=sessionIds.includes(session.id);
          return <label key={session.id}>
            <input type="checkbox" disabled={!!unavailable&&!selected} checked={selected}
              onChange={e=>setSessionIds(toggle(sessionIds,session.id,e.target.checked))}/>
            <span>{chatTitle(session)} · {session.provider}<small>{session.cwd}{unavailable&&` · ${unavailable}`}</small></span>
          </label>;
        })}
        {missingIds.length>0&&<button type="button" onClick={()=>setSessionIds(ids=>ids.filter(id=>!missingIds.includes(id)))}>
          Remove {missingIds.length===1?'closed session':`${missingIds.length} closed sessions`}
        </button>}
        {unavailableSelected&&<p role="status">Some selected sessions are unavailable. Deselect them or wait until they are ready.</p>}
      </div><p className="muted">{eligible.length?'Each session keeps its current project and conversation history.':'Open or continue a session and wait until it is idle.'}</p></>:<>
        <ProjectField value={project} onChange={setProject} choices={projects}/>
        <p className="muted">Every provider will use this same project folder for this comparison.</p>
      </>}
      <div className="compare-brief">
        <label><input type="checkbox" checked={includeBrief} onChange={e=>{setIncludeBrief(e.target.checked);setSnapshot(undefined);setError('')}}/>Include project brief</label>
        {includeBrief&&<>
          <label>Task and constraints (optional)
            <textarea rows={2} value={task} maxLength={4000} onChange={e=>setTask(e.target.value)} />
          </label>
          <div className="compare-brief-actions">
            <label><input type="checkbox" checked={includeDiff} onChange={e=>{setIncludeDiff(e.target.checked);setSnapshot(undefined);setError('')}}/>Include tracked diff</label>
            <button type="button" disabled={!briefProject} onClick={()=>void collectBrief()}>{brief?'Refresh brief':'Preview brief'}</button>
          </div>
          {!briefProject&&<p className="muted">{existing?'Select sessions from the same project to share a brief.':'Choose a Git project folder to preview the brief.'}</p>}
          {brief&&<label>Shared brief preview (sent to every recipient)<textarea className="compare-brief-preview" readOnly rows={6} value={evidence}/></label>}
        </>}
      </div>
    </fieldset>
    <p className="muted">Sessions in the same project share a working tree, so changes by one can affect the others.</p>
    <p className="muted">Attached images and files are sent to every provider. Each provider must support the selected file types.</p>
    {error&&<p role="alert" className="error">{error}</p>}
    <fieldset disabled={checking}><Composer attachments={attachments} onAttachments={setAttachments} onAttachmentBusy={setLoadingFiles} text={text} onText={setText} label="Comparison prompt" sendLabel={checking?'Checking project…':'Start comparison'} canSend={!checking&&canSend} onSend={()=>void compare()}
      secondaryAction={<button type="button" disabled={checking} onClick={onClose}>Cancel</button>}/></fieldset>
  </div></div>;
}
