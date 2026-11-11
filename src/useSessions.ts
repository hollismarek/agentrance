import {useCallback, useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {ActivityEvent} from './activity';
import {mergeEvents} from './sessionEvents';
import type {Provider, SavedSession, Session} from './types';
export function useSessions(onError: (message:string) => void) {
  const [sessions,setSessions] = useState<Session[]>([]);
  const [past,setPast] = useState<SavedSession[]>([]);
  const [panes,setPanes] = useState<string[]>([]);
  const [starting,setStarting] = useState(false);
  const earlyEvents = useRef(new Map<string, ActivityEvent[]>());
  const listenersReady = useRef<Promise<unknown>>(Promise.resolve());
  const refresh = useCallback(() => invoke<SavedSession[]>('history').then(setPast).catch(e => onError(String(e))),[onError]);
  useEffect(() => {
    refresh();
    const subscription = listen<ActivityEvent & {session:string}>('agent-event',({payload:e}) => {
      // session/new may emit identity/activity before the invocation returns.
      const buffered = earlyEvents.current.get(e.session);
      if (buffered) buffered.push(e);
      setSessions(all => all.map(s => s.id !== e.session ? s : {...s,items:mergeEvents(s.items,[e]),
        busy:['done','disconnected','session_closed'].includes(e.kind) ? false : s.busy,
        live:['disconnected','session_closed'].includes(e.kind) ? false : s.live,
        identity:e.kind === 'identity' ? e.data : s.identity}));
    });
    const errors = listen<string>('history-error',({payload}) => onError(payload));
    listenersReady.current = Promise.all([subscription,errors]);
    listenersReady.current.catch(e => onError(String(e)));
    return () => {subscription.then(f => f()).catch(()=>{});errors.then(f => f()).catch(()=>{})};
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
        live:!events.some(e => ['disconnected','session_closed'].includes(e.kind))}]);
    } finally {earlyEvents.current.delete(id)}
    void refresh();return id;
  }
  async function start(provider:Provider) {
    setStarting(true);
    try{setPanes([await fresh(provider)])}catch(e){onError(String(e))}finally{setStarting(false)}
  }
  async function send(ids:string[],text:string) {
    if (!text.trim()) return;
    await Promise.all(ids.map(async id => {
      setSessions(a => a.map(s => s.id === id ? {...s,busy:true} : s));
      try {await invoke('prompt',{id,text})}
      catch(e){onError(String(e));setSessions(a => a.map(s => s.id === id ? {...s,busy:false} : s))}
    }));
  }
  async function compare(providers:Provider[],question:string) {
    if(!question.trim() || !providers.length) return;
    setStarting(true);
    try {
      const results=await Promise.allSettled(providers.map(fresh));
      const ids=results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
      const failures=results.filter(r => r.status === 'rejected');
      if(failures.length) onError(failures.map(r => r.status === 'rejected' ? String(r.reason) : '').join('\n'));
      setPanes(ids);await send(ids,question);
    } finally {setStarting(false)}
  }
  async function open(saved:SavedSession) {
    try {
      if(!sessions.some(x => x.id === saved.id)) {
        const items=await invoke<ActivityEvent[]>('messages',{id:saved.id});
        setSessions(a => a.some(s => s.id === saved.id) ? a : [...a,{...saved,items,busy:false,live:false}]);
      }
      setPanes([saved.id]);
    } catch(e){onError(String(e))}
  }
  async function close(id:string) {
    try {
      await invoke('close_session',{id});
      setSessions(a => a.filter(s => s.id !== id));setPanes(a => a.filter(x => x !== id));
    } catch(e){onError(String(e))}
  }
  async function cancel(id:string) {try{await invoke('cancel',{id})}catch(e){onError(String(e))}}
  return {sessions,past,panes,setPanes,starting,start,send,compare,open,close,cancel};
}