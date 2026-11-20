import {useCallback, useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {startupErrors,reportSendFailure} from './comparisonErrors';
import {comparisonUnavailable} from './compareTargets';
import {chatTitle} from './history';
import type {Attachment} from './attachments';
import type {ActivityEvent} from './activity';
import {mergeEvents,connectionIsLive} from './sessionEvents';
import type {Provider, SavedSession, Session} from './types';
export function useSessions(onError: (message:string) => void) {
  const [sessions,setSessions] = useState<Session[]>([]);
  const [past,setPast] = useState<SavedSession[]>([]);
  const [panes,setPanes] = useState<string[]>([]);
  const [starting,setStarting] = useState(false);
  const switching = useRef(new Set<string>());
  const deleted = useRef(new Set<string>());
  const reconnecting = useRef(new Set<string>());
  const earlyEvents = useRef(new Map<string, ActivityEvent[]>());
  const pendingAcceptance=useRef(new Map<string,{id:string;accepted:()=>void}>());
  function accept(submissionId:string,id:string){
    const pending=pendingAcceptance.current.get(submissionId);
    if(!pending||pending.id!==id||deleted.current.has(id))return;
    pendingAcceptance.current.delete(submissionId);pending.accepted();
  }
  const listenersReady = useRef<Promise<unknown>>(Promise.resolve());
  const refresh = useCallback(() => invoke<SavedSession[]>('history').then(rows => {
    const current=rows.filter(s => !deleted.current.has(s.id));
    setPast(current);
    setSessions(all => all.map(s => {const metadata=current.find(row => row.id===s.id);return metadata?{...s,...metadata}:s}));
  }).catch(e => onError(String(e))),[onError]);
  useEffect(() => {
    refresh();
    const subscription = listen<ActivityEvent & {session:string}>('agent-event',({payload:e}) => {
      if(deleted.current.has(e.session))return;
      if(e.kind==='user')void refresh();
      // session/new may emit identity/activity before the invocation returns.
      const buffered = earlyEvents.current.get(e.session);
      if (buffered) buffered.push(e);
      setSessions(all => all.map(s => s.id !== e.session ? s : {...s,items:mergeEvents(s.items,[e]),
        busy:['done','disconnected','session_closed'].includes(e.kind) ? false : s.busy,
        live:['disconnected','session_closed'].includes(e.kind) ? false : s.live,
        identity:e.kind === 'identity' ? e.data : s.identity}));
    });
    const errors = listen<string>('history-error',({payload}) => onError(payload));
    const accepted=listen<{id:string;submissionId:string}>('prompt-accepted',({payload})=>accept(payload.submissionId,payload.id));
    listenersReady.current = Promise.all([subscription,errors,accepted]);
    listenersReady.current.catch(e => onError(String(e)));
    return () => {subscription.then(f => f()).catch(()=>{});errors.then(f => f()).catch(()=>{});accepted.then(f=>f()).catch(()=>{})};
  },[refresh,onError]);
  async function fresh(provider:Provider) {
    await listenersReady.current;
    // History replay fills the startup gap; events arriving during replay are
    // buffered by session id and deduplicated using persisted sequence numbers.
    const id = await invoke<string>('new_session',{provider});
    const buffered:ActivityEvent[]=[];
    earlyEvents.current.set(id,buffered);
    try {
      const items = await invoke<ActivityEvent[]>('messages',{id});
      const events=mergeEvents(items,buffered);
      setSessions(a => [...a,{id,provider:provider.name,cwd:provider.cwd,items:events,busy:false,
        live:connectionIsLive(events),providerId:provider.id,canResume:true}]);
    } finally {earlyEvents.current.delete(id)}
    void refresh();return id;
  }
  async function start(provider:Provider) {
    setStarting(true);
    try{setPanes([await fresh(provider)])}catch(e){onError(String(e))}finally{setStarting(false)}
  }
  async function send(ids:string[],text:string,attachments:Attachment[]=[],labels:Record<string,string>={},errors:string[]=[],onAccepted?:(id:string)=>void) {
    if (!text.trim()&&!attachments.length) return [];
    return Promise.all(ids.map(async id => {
      setSessions(a => a.map(s => s.id === id ? {...s,busy:true} : s));
      const submissionId=crypto.randomUUID();
      if(onAccepted)pendingAcceptance.current.set(submissionId,{id,accepted:()=>onAccepted(id)});
      try {await listenersReady.current;await invoke('prompt',{id,text,attachments,submissionId});accept(submissionId,id);return true}
      catch(e){reportSendFailure(errors,labels[id],e,onError);setSessions(a => a.map(s => s.id === id ? {...s,busy:false} : s));return false}
      finally{pendingAcceptance.current.delete(submissionId)}
    }));
  }
  async function compare(providers:Provider[],question:string,attachments:Attachment[]=[]) {
    if((!question.trim()&&!attachments.length) || !providers.length) return;
    setStarting(true);
    try {
      const results=await Promise.allSettled(providers.map(fresh));
      const ids=results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
      const errors=startupErrors(results,providers);
      if(errors.length)onError(errors.join('\n'));
      const labels=Object.fromEntries(results.flatMap((r,i)=>r.status==='fulfilled'?[[r.value,providers[i].name]]:[]));
      setPanes(ids);await send(ids,question,attachments,labels,errors);
    } finally {setStarting(false)}
  }
  async function open(saved:SavedSession) {
    try {
      if(!sessions.some(x => x.id === saved.id)) {
        const items=await invoke<ActivityEvent[]>('messages',{id:saved.id});
        setSessions(a => deleted.current.has(saved.id) || a.some(s => s.id === saved.id) ? a : [...a,{...saved,items,busy:false,live:false}]);
      }
      if(!deleted.current.has(saved.id))setPanes([saved.id]);
    } catch(e){onError(String(e))}
  }
  async function compareExisting(ids:string[],question:string,attachments:Attachment[]) {
    const labels:Record<string,string>={};
    const errors:string[]=[];
    const available:string[]=[];
    for(const id of new Set(ids)){
      const session=sessions.find(candidate=>candidate.id===id);
      if(!session||deleted.current.has(id)){
        errors.push('A selected conversation is no longer open.');
        continue;
      }
      labels[id]=`${chatTitle(session)} · ${session.provider}`;
      const unavailable=comparisonUnavailable(session);
      if(unavailable)errors.push(`${labels[id]}: ${unavailable}`);
      else available.push(id);
    }
    if(errors.length)onError(errors.join('\n'));
    await send(available,question,attachments,labels,errors);
  }
  async function restore(ids:string[]):Promise<string[]> {
    if(!ids.length)return [];
    const history=await invoke<SavedSession[]>('history');
    const rows=history.filter(s=>ids.includes(s.id)&&!deleted.current.has(s.id));
    const restored=await Promise.all(rows.map(async saved=>({...saved,
      items:await invoke<ActivityEvent[]>('messages',{id:saved.id}),busy:false,live:false})));
    setSessions(all=>[...all,...restored.filter(s=>!deleted.current.has(s.id)&&!all.some(existing=>existing.id===s.id))]);
    return restored.filter(s=>!deleted.current.has(s.id)).map(s=>s.id);
  }
  async function resume(saved:SavedSession,provider:Provider) {
    if(reconnecting.current.has(saved.id))return;
    reconnecting.current.add(saved.id);
    setSessions(a => a.map(s => s.id===saved.id ? {...s,resuming:true} : s));
    try {
      await listenersReady.current;
      await invoke('resume_session',{id:saved.id,provider});
      const items=await invoke<ActivityEvent[]>('messages',{id:saved.id});
      setSessions(a => a.map(s => s.id===saved.id ? {...s,items:mergeEvents(items,s.items),live:connectionIsLive(mergeEvents(items,s.items)),canResume:true,resuming:false} : s));
      void refresh();
    }catch(e){onError(String(e));setSessions(a => a.map(s => s.id===saved.id ? {...s,resuming:false,live:false} : s))}
    finally{reconnecting.current.delete(saved.id)}
  }
  async function close(id:string) {
    try {
      await invoke('close_session',{id});
      setSessions(a => a.filter(s => s.id !== id));
    } catch(e){onError(String(e))}
  }
  async function rename(id:string,title:string){
    await invoke('rename_session',{id,title});await refresh();
  }
  async function remove(id:string){
    await invoke('delete_session',{id});
    deleted.current.add(id);
    setSessions(a=>a.filter(s=>s.id!==id));setPast(a=>a.filter(s=>s.id!==id));
    await refresh();
  }
  async function setAgent(id:string,agentId:string){
    if(switching.current.has(id))return;
    switching.current.add(id);
    setSessions(a=>a.map(s=>s.id===id?{...s,changingAgent:true}:s));
    try{await invoke('set_agent',{id,agentId})}catch(e){onError(String(e))}
    finally{switching.current.delete(id);setSessions(a=>a.map(s=>s.id===id?{...s,changingAgent:false}:s))}
  }
  async function setModel(id:string,modelId:string){
    if(switching.current.has(id))return;
    switching.current.add(id);setSessions(a=>a.map(s=>s.id===id?{...s,changingModel:true}:s));
    try{await invoke('set_model',{id,modelId})}catch(e){onError(String(e))}
    finally{switching.current.delete(id);setSessions(a=>a.map(s=>s.id===id?{...s,changingModel:false}:s))}
  }
  async function cancel(id:string) {try{await invoke('cancel',{id})}catch(e){onError(String(e))}}
  return {sessions,past,panes,setPanes,starting,start,send,compare,compareExisting,open,restore,close,cancel,resume,rename,remove,setAgent,setModel};
}
