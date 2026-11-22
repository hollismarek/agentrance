import {invoke} from '@tauri-apps/api/core';
import React, {useEffect, useState, useReducer} from 'react';
import {createRoot} from 'react-dom/client';
import {withSavedProviders} from './providerSetup';
import {useTheme} from './useTheme';
import {useProviders} from './useProviders';
import {WorkspaceLayout} from './components/WorkspaceLayout';
import {useSessions} from './useSessions';
import {useWorkspaceRecovery} from './useWorkspaceRecovery';
import {AppMenu} from './components/AppMenu';
import {BackupDialog,type BackupProfileStatus} from './components/BackupDialog';
import {HelpDialog,type HelpTopic} from './components/HelpDialog';
import {Sidebar} from './components/Sidebar';
import {CompareDialog} from './components/CompareDialog';
import {NewSessionDialog} from './components/NewSessionDialog';
import {CloseRecoveryDialog} from './components/CloseRecoveryDialog';
import {projectChoices,initialProject,providersAtProject} from './projects';
import type {Provider} from './types';
import {ProviderSettings} from './components/ProviderSettings';
import {ErrorBoundary} from './components/ErrorBoundary';
import './style.css';
import {initialWorkspace,workspaceReducer,type LayoutMode,paneCount} from './workspace';
import {type Drafts} from './drafts';
function App() {
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [drafts,setDrafts]=useState<Drafts>({});
  const [comparison,setComparison]=useState(false);
  const [newSession,setNewSession]=useState<Provider|null>(null);
  const [workspace,dispatch]=useReducer(workspaceReducer,initialWorkspace);
  const [error,setError] = useState('');
  const [help,setHelp]=useState<{topic:HelpTopic;sessionId?:string}|null>(null);
  const [backup,setBackup]=useState(false);
  const [backupProfile,setBackupProfile]=useState<BackupProfileStatus|null>(null);
  const [cancellingRestore,setCancellingRestore]=useState(false);
  useEffect(()=>{
    void invoke<BackupProfileStatus>('backup_profile_status').then(setBackupProfile).catch(reason=>setError(String(reason)));
  },[]);
  async function cancelRestore(){
    setCancellingRestore(true);
    try{
      await invoke('cancel_backup_restore');
      setBackupProfile(profile=>profile&&{...profile,pending:false});
    }catch(reason){setError(String(reason))}
    finally{setCancellingRestore(false)}
  }
  const [settings,setSettings] = useState(false);
  const desk = useSessions(setError);
  const recovery=useWorkspaceRecovery(workspace,drafts,dispatch,setDrafts,desk.restore,setError);
  const {ready,channel,providers,selected,setSelected,save,needsSetup,detected,detecting,discoveryError,discover}=useProviders(setError);
  const theme=useTheme(channel);
  useEffect(()=>{if(needsSetup)setSettings(true)},[needsSetup]);
  useEffect(()=>{if(desk.panes.length)dispatch({type:'open',ids:desk.panes})},[desk.panes]);
  const sessionIds=desk.sessions.map(s=>s.id).join(',');
  useEffect(()=>{if(!recovery.ready)return;dispatch({type:'retain',ids:desk.sessions.map(s=>s.id)});setDrafts(d=>Object.fromEntries(desk.sessions.map(s=>[s.id,d[s.id]??{text:'',revision:0,attachments:[]}])))},[sessionIds,recovery.ready]);
  const visible=workspace.selected.filter((id,p)=>id&&(p<paneCount(workspace.mode))) as string[];
  const projects=projectChoices(recovery.recentProjects,providers,desk.past);
  return <><div className="app" inert={recovery.closing||!!recovery.closeError?true:undefined}>
    <Sidebar collapsed={sidebarCollapsed} onToggle={()=>setSidebarCollapsed(value=>!value)} providers={providers} selected={selected} past={desk.past} panes={visible} starting={desk.starting||!recovery.ready}
      busyIds={desk.sessions.filter(s=>s.busy||s.resuming||s.changingAgent||s.changingModel).map(s=>s.id)} onRename={desk.rename} onDelete={desk.remove}
      onStart={()=>{withSavedProviders(ready&&recovery.ready,needsSetup,()=>setSettings(true),()=>{const provider=providers.find(p=>p.id===selected);if(provider)setNewSession(provider)})}}
      onSelect={setSelected} onOpen={s => {if(recovery.ready)void desk.open(s)}}/>
    <main>
      <header><div className="workspace-heading"><strong>Conversations {channel==='Development'&&<span className="development-badge">DEV</span>}</strong></div><div className="header-actions">
        <button disabled={!recovery.ready||desk.starting||!providers.length} onClick={()=>{withSavedProviders(ready,needsSetup,()=>setSettings(true),()=>setComparison(true))}}>Compare…</button>
        <label className="layout-label">Layout <select aria-label="Conversation layout" value={workspace.mode} onChange={e=>dispatch({type:'mode',mode:e.target.value as LayoutMode})}><option value="single">Single pane</option><option value="columns">Side by side</option><option value="rows">Stacked</option><option value="three">Three panes</option><option value="grid">Four panes (grid)</option></select></label><AppMenu onBackup={()=>setBackup(true)} settingsReady={ready} onSettings={()=>setSettings(true)} onHelp={()=>setHelp({topic:'start'})}/></div>
      </header>
      {backupProfile?.pending&&<div className="restore-notice">
        <span role="status">Restore or profile switch pending. Reopen Agentrance to apply it.</span>
        <button disabled={cancellingRestore} onClick={()=>void cancelRestore()}>Cancel restore</button>
      </div>}
      {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      <WorkspaceLayout workspace={workspace} dispatch={dispatch} desk={desk} providers={providers} drafts={drafts} setDrafts={setDrafts} onHelp={id=>setHelp({topic:'models',sessionId:id})}/>
    </main>
    {newSession&&<NewSessionDialog provider={newSession} initialProject={initialProject([newSession],recovery.recentProjects)} projects={projects} onClose={()=>setNewSession(null)} onStart={cwd=>{setNewSession(null);withSavedProviders(ready,needsSetup,()=>setSettings(true),()=>{recovery.rememberProject(cwd);void desk.start(providersAtProject([newSession],cwd)[0])})}}/>}
    {comparison&&<CompareDialog providers={providers} sessions={desk.sessions} projects={projects}
      initialProject={initialProject(providers,recovery.recentProjects)} onClose={()=>setComparison(false)}
      onCompare={(text,attachments,cwd,selected)=>{setComparison(false);withSavedProviders(ready,needsSetup,()=>setSettings(true),()=>{recovery.rememberProject(cwd);void desk.compare(providersAtProject(selected,cwd),text,attachments)})}}
      onExisting={(text,attachments,ids)=>{setComparison(false);void desk.compareExisting(ids,text,attachments)}}/>}
    {help&&<HelpDialog initialTopic={help.topic} initialSessionId={help.sessionId} sessions={desk.sessions} onClose={()=>setHelp(null)}/>}
    {backup&&<BackupDialog onClose={()=>setBackup(false)} flushWorkspace={recovery.flushWorkspace} profile={backupProfile}
      onStaged={()=>setBackupProfile(profile=>({pending:true,hasPrevious:profile?.hasPrevious??false}))}/>}
    {settings && ready && <ProviderSettings providers={providers} detected={detected} detecting={detecting} discoveryError={discoveryError} onDiscover={discover} theme={theme.preference} onTheme={theme.choose} onSave={async providers=>{await save(providers);setSettings(false)}} onClose={() => setSettings(false)}/>}
  </div><CloseRecoveryDialog returnFocus={recovery.closeFocus} saving={recovery.closing} error={recovery.closeError} onRetry={()=>void recovery.retryClose()} onKeepWorking={recovery.keepWorking} onQuit={()=>void recovery.quitWithoutSaving()}/></>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary label="Agentrance"><App/></ErrorBoundary>);
