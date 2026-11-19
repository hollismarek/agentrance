import {useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {parseRecovery,retainRecovery,serializeRecovery,recoveryWriter} from './workspaceRecovery';
import type {Workspace,WorkspaceAction} from './workspace';
import type {Drafts} from './drafts';

export function useWorkspaceRecovery(workspace:Workspace,drafts:Drafts,dispatch:Dispatch<WorkspaceAction>,
 setDrafts:Dispatch<SetStateAction<Drafts>>,restore:(ids:string[])=>Promise<string[]>,onError:(message:string)=>void){
 const [ready,setReady]=useState(false),[writable,setWritable]=useState(false);
 const [recentProjects,setRecentProjects]=useState<string[]>([]);
 const [closing,setClosing]=useState(false),[closeError,setCloseError]=useState('');
 const closingRef=useRef(false);
 const raw=useMemo(()=>serializeRecovery(workspace,drafts,recentProjects),[workspace,drafts,recentProjects]);
 const latest=useRef({ready,writable,raw:''});
 latest.current={ready,writable,raw};
 const writer=useRef<ReturnType<typeof recoveryWriter>|null>(null);
 if(!writer.current)writer.current=recoveryWriter(raw=>invoke('save_workspace',{raw}),e=>onError(`Could not save workspace recovery: ${e}`));
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const saved=parseRecovery(await invoke<string|null>('load_workspace'));
    const ids=await restore(saved.workspace.groups.flat());
    if(!active)return;
    const recovered=retainRecovery(saved,ids);
    dispatch({type:'restore',workspace:recovered.workspace});setDrafts(recovered.drafts);
    setRecentProjects(recovered.recentProjects);setWritable(true);
   }catch(e){if(active)onError(`Workspace recovery could not be loaded: ${e}. Saved recovery is preserved; automatic workspace saving is disabled until restart.`)}
   finally{if(active)setReady(true)}
  })();
  return ()=>{active=false};
 },[]);
 useEffect(()=>{if(ready&&writable)writer.current?.(raw)},[ready,writable,raw]);
 useEffect(()=>{
  let active=true;let unlisten:(()=>void)|undefined;
  void listen('workspace-close-requested',async()=>{
   if(closingRef.current)return;
   if(!latest.current.ready){onError('Workspace recovery is still loading. Please try closing again when it finishes.');return}
   closingRef.current=true;setClosing(true);setCloseError('');
   try{
    if(!latest.current.writable)throw Error('Workspace recovery is unavailable; saved recovery has been preserved');
    let raw:string;
    do{raw=latest.current.raw;await writer.current!.flush(raw)}while(raw!==latest.current.raw);
    await invoke('finish_app_exit');
   }catch(e){setCloseError(`Could not save the latest workspace: ${e}. The window has been kept open.`);closingRef.current=false;setClosing(false)}
  }).then(async stop=>{if(!active){stop();return}unlisten=stop;await invoke('enable_workspace_recovery_guard')})
   .catch(e=>onError(`Could not enable save-on-close: ${e}`));
  return ()=>{active=false;unlisten?.()};
 },[]);
 return {ready,closing,closeError,quitWithoutSaving:()=>invoke('finish_app_exit').catch(e=>onError(String(e))),recentProjects,rememberProject:(path:string)=>setRecentProjects(all=>[path,...all.filter(p=>p!==path)].slice(0,20))};
}
