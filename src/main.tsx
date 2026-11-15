import React, {useEffect, useState, useReducer, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {defaultProviders, parseProviders, resumeProvider} from './providers';
import type {Provider} from './types';
import {useSessions} from './useSessions';
import {AppMenu} from './components/AppMenu';
import {HelpDialog,type HelpTopic} from './components/HelpDialog';
import {Sidebar} from './components/Sidebar';
import {SessionPane} from './components/SessionPane';
import {Composer} from './components/Composer';
import {CompareDialog} from './components/CompareDialog';
import {ProviderSettings} from './components/ProviderSettings';
import {ErrorBoundary} from './components/ErrorBoundary';
import './style.css';
import {initialWorkspace,workspaceReducer,type LayoutMode} from './workspace';
import {chatTitle} from './history';
function App() {
  const [providers,setProviders] = useState<Provider[]>([]);
  const [selected,setSelected] = useState('');
  const [drafts,setDrafts]=useState<Record<string,string>>({});
  const [comparison,setComparison]=useState(false);
  const [workspace,dispatch]=useReducer(workspaceReducer,initialWorkspace);
  const [ratio,setRatio]=useState(50);
  const splitRef=useRef<HTMLDivElement>(null);
  const [error,setError] = useState('');
  const [help,setHelp]=useState<{topic:HelpTopic;sessionId?:string}|null>(null);
  const [settings,setSettings] = useState(false);
  const desk = useSessions(setError);
  useEffect(() => {
    invoke<string>('startup_directory').then(cwd => {
      let loaded=defaultProviders(cwd);
      try {const raw=localStorage.getItem('providers');if(raw)loaded=parseProviders(raw)}
      catch(e){setError(`Saved provider settings could not be loaded: ${e}. Existing saved data has been preserved; review Provider settings.`)}
      setProviders(loaded);setSelected(loaded[0].id);
    }).catch(e => setError(`Could not determine the project directory: ${e}`));
  },[]);
  function save(providers:Provider[]) {
    localStorage.setItem('providers',JSON.stringify(providers));
    setProviders(providers);setSelected(providers[0].id);setSettings(false);
  }
  useEffect(()=>{if(desk.panes.length)dispatch({type:'open',ids:desk.panes})},[desk.panes]);
  const sessionIds=desk.sessions.map(s=>s.id).join(',');
  useEffect(()=>{dispatch({type:'retain',ids:desk.sessions.map(s=>s.id)});setDrafts(d=>Object.fromEntries(Object.entries(d).filter(([id])=>desk.sessions.some(s=>s.id===id))))},[sessionIds]);
  const visible=workspace.selected.filter((id,p)=>id&&(p===0||workspace.mode!=='single')) as string[];
  function resize(e:React.PointerEvent<HTMLDivElement>){
    const rect=splitRef.current?.getBoundingClientRect();if(!rect)return;
    const value=workspace.mode==='rows'?(e.clientY-rect.top)/rect.height:(e.clientX-rect.left)/rect.width;
    setRatio(Math.max(25,Math.min(75,value*100)));
  }
  return <div className="app">
    <Sidebar providers={providers} selected={selected} past={desk.past} panes={visible} starting={desk.starting}
      busyIds={desk.sessions.filter(s=>s.busy||s.resuming||s.changingAgent||s.changingModel).map(s=>s.id)} onRename={desk.rename} onDelete={desk.remove}
      onStart={() => {const provider=providers.find(p => p.id === selected);if(provider)void desk.start(provider)}}
      onSelect={setSelected} onOpen={s => void desk.open(s)}/>
    <main>
      <header><strong>Conversations</strong><div className="header-actions">
        <button disabled={desk.starting||!providers.length} onClick={()=>setComparison(true)}>Compare…</button>
        <label className="layout-label">Layout <select aria-label="Conversation layout" value={workspace.mode} onChange={e=>dispatch({type:'mode',mode:e.target.value as LayoutMode})}><option value="single">Single pane</option><option value="columns">Side by side</option><option value="rows">Stacked</option></select></label><AppMenu onSettings={()=>setSettings(true)} onHelp={()=>setHelp({topic:'start'})}/></div>
      </header>
      {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      <div ref={splitRef} className={`workspace ${workspace.mode}`}>
        {([0,1] as const).filter(p=>p===0||workspace.mode!=='single').map(p=>{
          const id=workspace.selected[p],session=desk.sessions.find(s=>s.id===id);
          const text=id?drafts[id]??'':'';
          const canSend=!!session?.live&&!session.busy&&!session.resuming&&!session.changingAgent&&!session.changingModel&&!!text.trim();
          return <React.Fragment key={p}>
            {p===1&&<div className="pane-divider" role="separator" tabIndex={0} aria-label="Resize conversation panes" aria-orientation={workspace.mode==='rows'?'horizontal':'vertical'} aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(ratio)}
              onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);resize(e)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))resize(e)}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
              onKeyDown={e=>{if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home'].includes(e.key)){e.preventDefault();setRatio(r=>e.key==='Home'?50:Math.max(25,Math.min(75,r+(['ArrowLeft','ArrowUp'].includes(e.key)?-5:5))))}}}/>}
            <section aria-label={`Conversation pane ${p+1}`} className={`workspace-pane ${workspace.focus===p?'focused':''}`} style={{flex:workspace.mode==='single'?1:p===0?ratio:100-ratio}} onFocusCapture={()=>dispatch({type:'focus',pane:p})} onPointerDown={()=>dispatch({type:'focus',pane:p})}>
              <div className="tabs" role="tablist" aria-label={`Pane ${p+1} conversations`}>{workspace.groups[p].map(tabId=>{
                const tab=desk.sessions.find(s=>s.id===tabId);if(!tab)return null;
                return <div className="session-tab" key={tabId}><button role="tab" aria-selected={tabId===id} className={tabId===id?'active':''} onClick={()=>dispatch({type:'select',pane:p,id:tabId})}>{chatTitle(tab)} {tab.busy?'◌':''}<small>{tab.provider}</small></button><button aria-label={`Close ${chatTitle(tab)}`} onClick={()=>void desk.close(tabId)}>×</button></div>;
              })}</div>
              {session&&id?<><div className="pane-actions"><button onClick={()=>dispatch({type:'move',id,pane:p===0?1:0})}>Move to other pane</button></div>
                <ErrorBoundary key={id} label={`${session.provider} conversation`}>
                  <SessionPane session={session} onHelp={()=>setHelp({topic:'models',sessionId:id})} onModel={modelId=>void desk.setModel(id,modelId)} onAgent={agentId=>void desk.setAgent(id,agentId)} resumeAvailable={!!resumeProvider(providers,session)}
                    onResume={()=>{const provider=resumeProvider(providers,session);if(provider)void desk.resume(session,provider)}} onPermission={async(request,option)=>{await invoke('permission',{id,request,option})}} onCancel={()=>void desk.cancel(id)}>
                    <Composer text={text} onText={value=>setDrafts(d=>({...d,[id]:value}))} canSend={canSend} label={`Message to ${session.provider}`} onSend={()=>{if(canSend){void desk.send([id],text);setDrafts(d=>({...d,[id]:''}))}}}/>
                  </SessionPane>
                </ErrorBoundary></>:<div className="empty"><h2>{desk.sessions.length?'Choose a conversation':'A second perspective starts here.'}</h2><p>Click this pane, then start a session or open a chat from history.</p></div>}
            </section>
          </React.Fragment>;
        })}
      </div>
    </main>
    {comparison&&<CompareDialog providers={providers} onClose={()=>setComparison(false)} onCompare={text=>{setComparison(false);void desk.compare(providers,text)}}/>}
    {help&&<HelpDialog initialTopic={help.topic} initialSessionId={help.sessionId} sessions={desk.sessions} onClose={()=>setHelp(null)}/>}
    {settings && <ProviderSettings providers={providers} onSave={save} onClose={() => setSettings(false)}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary label="Agent Desk"><App/></ErrorBoundary>);
