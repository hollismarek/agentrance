import React, {useEffect, useState, useReducer} from 'react';
import {createRoot} from 'react-dom/client';
import {useTheme} from './useTheme';
import {useProviders} from './useProviders';
import {WorkspaceLayout} from './components/WorkspaceLayout';
import {useSessions} from './useSessions';
import {AppMenu} from './components/AppMenu';
import {HelpDialog,type HelpTopic} from './components/HelpDialog';
import {Sidebar} from './components/Sidebar';
import {CompareDialog} from './components/CompareDialog';
import {ProviderSettings} from './components/ProviderSettings';
import {ErrorBoundary} from './components/ErrorBoundary';
import './style.css';
import {initialWorkspace,workspaceReducer,type LayoutMode,paneCount} from './workspace';
import {type Drafts} from './drafts';
function App() {
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [drafts,setDrafts]=useState<Drafts>({});
  const [comparison,setComparison]=useState(false);
  const [workspace,dispatch]=useReducer(workspaceReducer,initialWorkspace);
  const [error,setError] = useState('');
  const [help,setHelp]=useState<{topic:HelpTopic;sessionId?:string}|null>(null);
  const [settings,setSettings] = useState(false);
  const desk = useSessions(setError);
  const {ready,channel,providers,selected,setSelected,save,needsSetup,detected,detecting,discoveryError,discover}=useProviders(setError);
  const theme=useTheme(channel);
  useEffect(()=>{if(needsSetup)setSettings(true)},[needsSetup]);
  useEffect(()=>{if(desk.panes.length)dispatch({type:'open',ids:desk.panes})},[desk.panes]);
  const sessionIds=desk.sessions.map(s=>s.id).join(',');
  useEffect(()=>{dispatch({type:'retain',ids:desk.sessions.map(s=>s.id)});setDrafts(d=>Object.fromEntries(Object.entries(d).filter(([id])=>desk.sessions.some(s=>s.id===id))))},[sessionIds]);
  const visible=workspace.selected.filter((id,p)=>id&&(p<paneCount(workspace.mode))) as string[];
  return <div className="app">
    <Sidebar collapsed={sidebarCollapsed} onToggle={()=>setSidebarCollapsed(value=>!value)} providers={providers} selected={selected} past={desk.past} panes={visible} starting={desk.starting}
      busyIds={desk.sessions.filter(s=>s.busy||s.resuming||s.changingAgent||s.changingModel).map(s=>s.id)} onRename={desk.rename} onDelete={desk.remove}
      onStart={() => {const provider=providers.find(p => p.id === selected);if(provider){if(!provider.cwd.trim())setSettings(true);else void desk.start(provider)}}}
      onSelect={setSelected} onOpen={s => void desk.open(s)}/>
    <main>
      <header><div className="workspace-heading"><strong>Conversations {channel==='Development'&&<span className="development-badge">DEV</span>}</strong></div><div className="header-actions">
        <button disabled={desk.starting||!providers.length} onClick={()=>{if(providers.some(p=>!p.cwd.trim()))setSettings(true);else setComparison(true)}}>Compare…</button>
        <label className="layout-label">Layout <select aria-label="Conversation layout" value={workspace.mode} onChange={e=>dispatch({type:'mode',mode:e.target.value as LayoutMode})}><option value="single">Single pane</option><option value="columns">Side by side</option><option value="rows">Stacked</option><option value="three">Three panes</option><option value="grid">Four panes (grid)</option></select></label><AppMenu settingsReady={ready} onSettings={()=>setSettings(true)} onHelp={()=>setHelp({topic:'start'})}/></div>
      </header>
      {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      <WorkspaceLayout workspace={workspace} dispatch={dispatch} desk={desk} providers={providers} drafts={drafts} setDrafts={setDrafts} onHelp={id=>setHelp({topic:'models',sessionId:id})}/>
    </main>
    {comparison&&<CompareDialog providers={providers} onClose={()=>setComparison(false)} onCompare={text=>{setComparison(false);void desk.compare(providers,text)}}/>}
    {help&&<HelpDialog initialTopic={help.topic} initialSessionId={help.sessionId} sessions={desk.sessions} onClose={()=>setHelp(null)}/>}
    {settings && ready && <ProviderSettings providers={providers} detected={detected} detecting={detecting} discoveryError={discoveryError} onDiscover={discover} theme={theme.preference} onTheme={theme.choose} onSave={async providers=>{await save(providers);setSettings(false)}} onClose={() => setSettings(false)}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary label="Agentrance"><App/></ErrorBoundary>);
