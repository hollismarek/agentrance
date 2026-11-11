import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke} from '@tauri-apps/api/core';
import {defaultProviders, parseProviders, resumeProvider} from './providers';
import type {Provider} from './types';
import {useSessions} from './useSessions';
import {Sidebar} from './components/Sidebar';
import {SessionPane} from './components/SessionPane';
import {Composer} from './components/Composer';
import {ProviderSettings} from './components/ProviderSettings';
import {ErrorBoundary} from './components/ErrorBoundary';
import './style.css';
import {chatTitle} from './history';
function App() {
  const [providers,setProviders] = useState<Provider[]>([]);
  const [selected,setSelected] = useState('');
  const [text,setText] = useState('');
  const [error,setError] = useState('');
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
  const canSend=!!text.trim() && !desk.starting && !!desk.panes.length && desk.panes.every(id => {
    const s=desk.sessions.find(s => s.id === id);return s?.live && !s.busy && !s.resuming && !s.changingAgent;
  });
  function send(){if(canSend){void desk.send(desk.panes,text);setText('')}}
  function compare(){const question=text;setText('');void desk.compare(providers,question)}
  return <div className="app">
    <Sidebar providers={providers} selected={selected} past={desk.past} panes={desk.panes} starting={desk.starting}
      busyIds={desk.sessions.filter(s=>s.busy||s.resuming||s.changingAgent).map(s=>s.id)} onRename={desk.rename} onDelete={desk.remove}
      onStart={() => {const provider=providers.find(p => p.id === selected);if(provider)void desk.start(provider)}}
      onSelect={setSelected} onOpen={s => void desk.open(s)} onSettings={() => setSettings(true)}/>
    <main>
      <header><div><strong>Your agents, one desk.</strong><small>Independent conversations · local history</small></div>
        <button onClick={() => desk.setPanes(desk.sessions.filter(s => s.live).map(s => s.id))}>Split open sessions</button>
      </header>
      {error && <div role="alert" className="error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      <div className="tabs">{desk.sessions.map(s => <div className="session-tab" key={s.id}>
        <button onClick={() => desk.setPanes([s.id])}>{chatTitle(s)} {s.busy ? '◌' : ''}<small>{s.provider}</small></button>
        <button aria-label={`Close ${chatTitle(s)}`} onClick={() => void desk.close(s.id)}>×</button>
      </div>)}</div>
      <section className="panes">
        {!desk.panes.length && <div className="empty"><h2>A second perspective starts here.</h2>
          <p>Start a session, or write a question and compare all configured providers.</p>
          <p>Comparisons always open fresh, independent sessions.</p>
        </div>}
        {desk.panes.map(id => {
          const session=desk.sessions.find(s => s.id === id);if(!session)return null;
          return <ErrorBoundary key={id} label={`${session.provider} conversation`}>
            <SessionPane session={session} onAgent={agentId=>void desk.setAgent(id,agentId)} resumeAvailable={!!resumeProvider(providers,session)}
              onResume={() => {const provider=resumeProvider(providers,session);if(provider)void desk.resume(session,provider)}} onPermission={async(request,option) => {await invoke('permission',{id,request,option})}} onCancel={() => void desk.cancel(id)}/>
          </ErrorBoundary>;
        })}
      </section>
      <Composer text={text} onText={setText} onSend={send} onCompare={compare} canSend={canSend}
        canCompare={!desk.starting && !!providers.length && !!text.trim()}/>
    </main>
    {settings && <ProviderSettings providers={providers} onSave={save} onClose={() => setSettings(false)}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary label="Agent Desk"><App/></ErrorBoundary>);
