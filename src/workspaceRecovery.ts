import {paneCount,workspaceReducer,type Workspace,type LayoutMode} from './workspace';
import {disambiguateWorkspaceNames,initialWorkspaces,MAX_WORKSPACES,MAX_WORKSPACE_NAME,type Workspaces} from './namedWorkspaces';
import type {Drafts} from './drafts';

export type Recovery={workspaces:Workspaces;drafts:Drafts;recentProjects:string[]};
const modes:LayoutMode[]=['single','columns','rows','three','grid'];
const invalid=()=>Error('Invalid workspace recovery format');
function parseLayout(w:any):Workspace {
 if(!w||!modes.includes(w.mode)||!Array.isArray(w.groups)||w.groups.length!==4||
  !w.groups.every((g:unknown)=>Array.isArray(g)&&g.every(id=>typeof id==='string'&&id.length>0))||
  !Array.isArray(w.selected)||w.selected.length!==4||!w.selected.every((id:unknown,p:number)=>id===null||w.groups[p].includes(id))||
  !Number.isInteger(w.focus)||w.focus<0||w.focus>=paneCount(w.mode)||
  w.groups.slice(paneCount(w.mode)).some((g:string[])=>g.length))throw invalid();
 return w;
}

export const workspaceSessions=(workspaces:Workspaces)=>workspaces.entries.flatMap(entry=>entry.layout.groups.flat());

export function parseRecovery(raw:string|null):Recovery {
 if(raw===null)return {workspaces:initialWorkspaces,drafts:{},recentProjects:[]};
 const value=JSON.parse(raw);
 if(!value?.drafts||typeof value.drafts!=='object'||Array.isArray(value.drafts)||
  !Array.isArray(value.recentProjects)||!value.recentProjects.every((p:unknown)=>typeof p==='string'))throw invalid();
 let workspaces:Workspaces;
 if(value.version===1){
  workspaces={...initialWorkspaces,entries:[{...initialWorkspaces.entries[0],layout:parseLayout(value.workspace)}]};
 }else{
  const saved=value.workspaces;
  if(value.version!==2||!Array.isArray(saved?.entries)||!saved.entries.length||saved.entries.length>MAX_WORKSPACES)throw invalid();
  const entries:Workspaces["entries"]=saved.entries.map((entry:any)=>{
   if(typeof entry?.id!=='string'||!entry.id||typeof entry.name!=='string'||!entry.name.trim()||
    entry.name.length>MAX_WORKSPACE_NAME||typeof entry.project!=='string')throw invalid();
   return {id:entry.id,name:entry.name,project:entry.project,layout:parseLayout(entry.layout)};
  });
  if(new Set(entries.map(entry=>entry.id)).size!==entries.length||!entries.some(entry=>entry.id===saved.active))throw invalid();
  workspaces={entries:disambiguateWorkspaceNames(entries),active:saved.active};
 }
 const ids=workspaceSessions(workspaces);
 if(ids.length>1000||new Set(ids).size!==ids.length)throw invalid();
 const drafts:Drafts=Object.create(null);
 for(const id of ids){
  const d=value.drafts[id];
  if(d!==undefined&&(typeof d?.text!=='string'||!Array.isArray(d.missingAttachments)||!d.missingAttachments.every((name:unknown)=>typeof name==='string')))throw Error('Invalid recovered draft');
  drafts[id]={text:d?.text??'',revision:0,attachments:[],missingAttachments:d?.missingAttachments??[]};
 }
 return {workspaces,drafts,recentProjects:value.recentProjects.slice(0,20)};
}

export function retainRecovery(saved:Recovery,ids:string[]):Recovery {
 const workspaces={...saved.workspaces,entries:saved.workspaces.entries.map(entry=>({
  ...entry,layout:workspaceReducer(entry.layout,{type:'retain',ids}),
 }))};
 return {...saved,workspaces,drafts:Object.fromEntries(workspaceSessions(workspaces).map(id=>[id,saved.drafts[id]]))};
}

export function serializeRecovery(workspaces:Workspaces,drafts:Drafts,recentProjects:string[]):string {
 return JSON.stringify({version:2,workspaces,drafts:Object.fromEntries(workspaceSessions(workspaces).map(id=>[id,{
  text:drafts[id]?.text??'',missingAttachments:[...(drafts[id]?.missingAttachments??[]),...(drafts[id]?.attachments??[]).map(file=>file.name)],
 }])),recentProjects:recentProjects.slice(0,20)});
}
// Serialize disk writes; while a write is pending, only the newest snapshot is needed.
export function recoveryWriter(save:(raw:string)=>Promise<unknown>,onError:(error:unknown)=>void){
 let pending:string|undefined,running:Promise<void>|null=null,lastError:unknown;
 async function drain(){
  try{while(pending!==undefined){const raw=pending;pending=undefined;try{await save(raw);lastError=undefined}catch(e){lastError=e;onError(e)}}}
  finally{running=null}
 }
 const write=(raw:string)=>{pending=raw;if(!running)running=Promise.resolve().then(drain)};
 write.flush=async(raw?:string)=>{if(raw!==undefined)write(raw);while(running)await running;if(lastError!==undefined)throw lastError};
 return write;
}
