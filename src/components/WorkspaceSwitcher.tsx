import React,{useMemo} from 'react';
import {pendingApprovals} from '../approvalState';
import {MAX_WORKSPACES,type Workspaces} from '../namedWorkspaces';
import type {Session} from '../types';

export function WorkspaceSwitcher({workspaces,sessions,disabled,onSwitch,onCreate,onEdit}:{
 workspaces:Workspaces;sessions:Session[];disabled:boolean;
 onSwitch:(id:string)=>void;onCreate:()=>void;onEdit:()=>void;
}){
 const labels=useMemo(()=>{
  const counts=new Map(sessions.filter(session=>session.live)
   .map(session=>[session.id,pendingApprovals(session.items,true).length]));
  return workspaces.entries.map(entry=>{
   const count=entry.layout.groups.flat().reduce((total,id)=>total+(counts.get(id)??0),0);
   return {...entry,label:count?`${entry.name} · ${count} waiting for approval`:entry.name,count};
  });
 },[sessions,workspaces.entries]);
 const waitingElsewhere=labels.reduce((total,entry)=>total+(entry.id===workspaces.active?0:entry.count),0);
 const waitingLabel=`${waitingElsewhere} pending ${waitingElsewhere===1?'approval':'approvals'} in other workspaces`;
 return <div className="workspace-switcher">
  <label className="workspace-picker"><span>Active workspace</span><select aria-label="Workspace" value={workspaces.active} disabled={disabled} onChange={e=>onSwitch(e.target.value)}>
   {labels.map(entry=><option key={entry.id} value={entry.id}>{entry.label}</option>)}
  </select></label>
  {waitingElsewhere>0&&<span role="status" className="tab-approval" aria-label={waitingLabel} title={waitingLabel}>! {waitingElsewhere}</span>}
  <button type="button" title="New workspace" aria-label="New workspace" disabled={disabled||workspaces.entries.length>=MAX_WORKSPACES} onClick={onCreate}>+</button>
  <button type="button" title="Edit workspace name and project" aria-label="Edit workspace name and project" disabled={disabled} onClick={onEdit}>✎</button>
 </div>;
}
