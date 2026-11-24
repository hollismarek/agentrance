import {initialWorkspace,workspaceReducer,type Workspace,type WorkspaceAction} from './workspace';

export type NamedWorkspace={id:string;name:string;project:string;layout:Workspace};
export type Workspaces={active:string;entries:NamedWorkspace[]};
export const MAX_WORKSPACES=20;
export const MAX_WORKSPACE_NAME=60;
export const initialWorkspaces:Workspaces={
 active:'default',entries:[{id:'default',name:'Workspace 1',project:'',layout:initialWorkspace}],
};
type Action=
 |{type:'restore';workspaces:Workspaces}
 |{type:'switch';id:string}
 |{type:'create';id:string;name:string;project:string}
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
   if(state.entries.length>=MAX_WORKSPACES||state.entries.some(entry=>entry.id===action.id))return state;
   return {active:action.id,entries:[...state.entries,{id:action.id,name:action.name,project:action.project,layout:initialWorkspace}]};
  case 'edit':return update(action.id,entry=>({...entry,name:action.name,project:action.project}));
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
   return {...next,entries:next.entries.map(entry=>entry.id===action.id?{
    ...entry,project:entry.project||action.project||'',
    layout:workspaceReducer(entry.layout,{type:'open',ids:unowned}),
   }:entry)};
  }
 }
}
