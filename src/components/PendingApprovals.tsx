import React,{useMemo,useState} from 'react';
import {reduceActivity,type ActivityEvent} from '../activity';
import {PermissionDetails} from './PermissionDetails';
export function PendingApprovals({events,live,provider,onPermission}:{events:ActivityEvent[];live:boolean;provider:string;onPermission:(request:unknown,option:string|null)=>Promise<void>}){
 const pending=useMemo(()=>reduceActivity(events,live).flatMap(op=>op.approvals.filter(a=>!a.expired&&!a.decision)),[events,live]);
 const [sending,setSending]=useState<string[]>([]),[error,setError]=useState('');
 if(!pending.length)return null;
 async function decide(request:unknown,option:string|null){const key=JSON.stringify(request);if(sending.includes(key))return;setSending(s=>[...s,key]);setError('');try{await onPermission(request,option)}catch(e){setError(String(e))}finally{setSending(s=>s.filter(k=>k!==key))}}
 return <section className="pending-approvals" aria-label={`${provider} pending approvals`}><h4>Approval required · {provider}</h4>{error&&<p role="alert">{error}</p>}{pending.map((a,i)=><div className="approval-record" key={`${a.generation}-${JSON.stringify(a.request)}-${i}`}><PermissionDetails params={a.params} provider={provider}/><div className="approval-buttons">{a.params.options.map((o:any)=><button key={o.optionId} disabled={sending.includes(JSON.stringify(a.request))} onClick={()=>void decide(a.request,o.optionId)}>{o.name}<small>{o.kind}</small></button>)}<button disabled={sending.includes(JSON.stringify(a.request))} onClick={()=>void decide(a.request,null)}>Cancel request</button></div></div>)}</section>;
}
