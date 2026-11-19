import {initialWorkspace,paneCount,workspaceReducer,type Workspace,type LayoutMode} from './workspace';
import type {Drafts} from './drafts';

export type Recovery={version:1;workspace:Workspace;drafts:Drafts;recentProjects:string[]};
const modes:LayoutMode[]=['single','columns','rows','three','grid'];
export function parseRecovery(raw:string|null):Recovery {
 if(raw===null)return {version:1,workspace:initialWorkspace,drafts:{},recentProjects:[]};
 const value=JSON.parse(raw);
 const w=value?.workspace;
 if(value?.version!==1||!w||!modes.includes(w.mode)||!Array.isArray(w.groups)||w.groups.length!==4||
  !w.groups.every((g:unknown)=>Array.isArray(g)&&g.every(id=>typeof id==='string'&&id.length>0))||
  w.groups.flat().length>1000||new Set(w.groups.flat()).size!==w.groups.flat().length||
  !Array.isArray(w.selected)||w.selected.length!==4||!w.selected.every((id:unknown,p:number)=>id===null||w.groups[p].includes(id))||
  !Number.isInteger(w.focus)||w.focus<0||w.focus>=paneCount(w.mode)||
  w.groups.slice(paneCount(w.mode)).some((g:string[])=>g.length)||
  !value.drafts||typeof value.drafts!=='object'||Array.isArray(value.drafts)||
  !Array.isArray(value.recentProjects)||!value.recentProjects.every((p:unknown)=>typeof p==='string'))throw Error('Invalid workspace recovery format');
 const drafts:Drafts=Object.create(null);
 for(const id of w.groups.flat() as string[]){
  const d=value.drafts[id];
  if(d!==undefined&&(typeof d?.text!=='string'||!Array.isArray(d.missingAttachments)||!d.missingAttachments.every((name:unknown)=>typeof name==='string')))throw Error('Invalid recovered draft');
  drafts[id]={text:d?.text??'',revision:0,attachments:[],missingAttachments:d?.missingAttachments??[]};
 }
 return {version:1,workspace:w,drafts,recentProjects:value.recentProjects.slice(0,20)};
}
export function retainRecovery(saved:Recovery,ids:string[]):Recovery {
 const workspace=workspaceReducer(saved.workspace,{type:'retain',ids});
 return {...saved,workspace,drafts:Object.fromEntries(workspace.groups.flat().map(id=>[id,saved.drafts[id]??{text:'',revision:0,attachments:[]}]))};
}
export function serializeRecovery(workspace:Workspace,drafts:Drafts,recentProjects:string[]):string {
 return JSON.stringify({version:1,workspace,drafts:Object.fromEntries(workspace.groups.flat().map(id=>[id,{
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
