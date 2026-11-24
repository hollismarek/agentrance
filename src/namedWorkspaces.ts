import {initialWorkspace,workspaceReducer,type Workspace,type WorkspaceAction} from './workspace';

export type NamedWorkspace={id:string;name:string;project:string;layout:Workspace};
export type Workspaces={active:string;entries:NamedWorkspace[]};
export const MAX_WORKSPACES=20;
export const MAX_WORKSPACE_NAME=60;
export const initialWorkspaces:Workspaces={
 active:'default',entries:[{id:'default',name:'Workspace 1',project:'',layout:initialWorkspace}],
};
const nameKey=(name:string)=>name.trim().toLowerCase();

export function workspaceNameTaken(entries:NamedWorkspace[],name:string,exceptId?:string):boolean {
 return entries.some(entry=>entry.id!==exceptId&&nameKey(entry.name)===nameKey(name));
}

// Older saves can contain duplicate names. Keep the first label and all tabs.
export function disambiguateWorkspaceNames(entries:NamedWorkspace[]):NamedWorkspace[]{
 const reserved=new Set(entries.map(entry=>nameKey(entry.name)));
 const seen=new Set<string>();
 return entries.map(entry=>{
  const key=nameKey(entry.name);
  if(!seen.has(key)){seen.add(key);return entry}
  let name:string;
  for(let number=2;;number++){
   const suffix=` (${number})`;
   const prefix=entry.name.trim().slice(0,MAX_WORKSPACE_NAME-suffix.length)
    .replace(/[\uD800-\uDBFF]$/,'').trimEnd();
   name=prefix+suffix;
   if(!reserved.has(nameKey(name)))break;
  }
  reserved.add(nameKey(name));
  return {...entry,name};
 });
}
type Action=
 |{type:'restore';workspaces:Workspaces}
 |{type:'switch';id:string}
 |{type:'create';id:string;name:string;project:string}
 |{type:'delete';id:string}
 |{type:'edit';id:string;name:string;project:string}
 |{type:'layout';id:string;action:WorkspaceAction}
 |{type:'open';id:string;ids:string[];project?:string}
 |{type:'retain';ids:string[]};

export function workspacesReducer(state:Workspaces,action:Action):Workspaces{
 const update=(id:string,change:(entry:NamedWorkspace)=>NamedWorkspace)=>({
  ...state,entries:state.entries.map(entry=>entry.id===id?change(entry):entry),
 });
 switch(action.type){
  case 'restore':return action.workspaces;
  case 'switch':return state.entries.some(entry=>entry.id===action.id)?{...state,active:action.id}:state;
  case 'create':
   if(state.entries.length>=MAX_WORKSPACES||state.entries.some(entry=>entry.id===action.id)||
    !action.name.trim()||action.name.trim().length>MAX_WORKSPACE_NAME||workspaceNameTaken(state.entries,action.name))return state;
   return {active:action.id,entries:[...state.entries,{id:action.id,name:action.name.trim(),project:action.project,layout:initialWorkspace}]};
  case 'edit':
   if(!action.name.trim()||action.name.trim().length>MAX_WORKSPACE_NAME||workspaceNameTaken(state.entries,action.name,action.id))return state;
   return update(action.id,entry=>({...entry,name:action.name.trim(),project:action.project}));
  case 'delete':{
   const removed=state.entries.find(entry=>entry.id===action.id);
   const destination=state.entries.find(entry=>entry.id!==action.id);
   if(!removed||!destination)return state;
   const ids=removed.layout.groups.flat();
   const pane=destination.layout.focus;
   const layout={
    ...destination.layout,
    groups:destination.layout.groups.map((group,index)=>index===pane?[...group,...ids]:group),
    selected:destination.layout.selected.map((id,index)=>index===pane?id??ids[0]??null:id),
   };
   return {
    active:state.active===removed.id?destination.id:state.active,
    entries:state.entries.filter(entry=>entry!==removed).map(entry=>entry===destination?{...entry,layout}:entry),
   };
  }
  case 'layout':return update(action.id,entry=>({...entry,layout:workspaceReducer(entry.layout,action.action)}));
  case 'retain':return {...state,entries:state.entries.map(entry=>({...entry,layout:workspaceReducer(entry.layout,action)}))};
  case 'open':{
   // A saved conversation has one owner. Selecting it from history focuses its
   // existing tab. Async completions never pull the user into another workspace.
   let next=state;
   const unowned:string[]=[];
   for(const id of action.ids){
    const owner=next.entries.find(entry=>entry.layout.groups.some(group=>group.includes(id)));
    if(!owner){unowned.push(id);continue}
    const pane=owner.layout.groups.findIndex(group=>group.includes(id));
    next={...next, entries:next.entries.map(entry=>entry===owner
     ?{...entry,layout:workspaceReducer(entry.layout,{type:'select',pane,id})}:entry)};
    if(action.ids.length===1&&state.active===action.id)next={...next,active:owner.id};
   }
   if(!unowned.length)return next;
   const destination=next.entries.some(entry=>entry.id===action.id)?action.id:next.active;
   return {...next,entries:next.entries.map(entry=>entry.id===destination?{
    ...entry,project:entry.project||action.project||'',
    layout:workspaceReducer(entry.layout,{type:'open',ids:unowned}),
   }:entry)};
  }
 }
}
