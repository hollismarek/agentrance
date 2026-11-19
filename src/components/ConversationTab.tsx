import React,{useMemo} from 'react';
import {pendingApprovals} from '../approvalState';
import {chatTitle} from '../history';
import type {Session} from '../types';
export function ConversationTab({session,selected,onSelect,onClose}:{session:Session;selected:boolean;onSelect:()=>void;onClose:()=>void}){
 const count=useMemo(()=>pendingApprovals(session.items,session.live).length,[session.items,session.live]);
 const label=`Waiting for approval (${count} ${count===1?'request':'requests'})`;
 return <div className={`session-tab${count?' awaiting-approval':''}`}>
  <button role="tab" aria-selected={selected} className={selected?'active':''} onClick={onSelect}>
   {count>0&&<span className="tab-approval" role="img" aria-label={label} title={label}><span aria-hidden="true">! {count}</span></span>}
   {chatTitle(session)} {!count&&session.busy?'◌':''}<small>{session.provider}</small>
  </button>
  <button aria-label={`Close ${chatTitle(session)}`} onClick={onClose}>×</button>
 </div>;
}
