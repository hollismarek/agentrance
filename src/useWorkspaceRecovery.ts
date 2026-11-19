import {useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {parseRecovery,retainRecovery,serializeRecovery,recoveryWriter} from './workspaceRecovery';
import type {Workspace,WorkspaceAction} from './workspace';
import type {Drafts} from './drafts';

export function useWorkspaceRecovery(workspace:Workspace,drafts:Drafts,dispatch:Dispatch<WorkspaceAction>,
 setDrafts:Dispatch<SetStateAction<Drafts>>,restore:(ids:string[])=>Promise<string[]>,onError:(message:string)=>void){
 const [ready,setReady]=useState(false),[writable,setWritable]=useState(false);
 const [recentProjects,setRecentProjects]=useState<string[]>([]);
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
 useEffect(()=>{if(ready&&writable)writer.current?.(serializeRecovery(workspace,drafts,recentProjects))},[ready,writable,workspace,drafts,recentProjects]);
 return {ready,recentProjects,rememberProject:(path:string)=>setRecentProjects(all=>[path,...all.filter(p=>p!==path)].slice(0,20))};
}
