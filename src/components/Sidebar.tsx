import React, {useState} from 'react';
import type {Provider, SavedSession} from '../types';
import {chatTitle, historyDate} from '../history';
export function Sidebar({collapsed=false, onToggle, providers, selected, past, panes, starting, busyIds, onStart, onSelect, onOpen, onRename, onDelete}: {
  collapsed?: boolean; onToggle?: () => void; providers: Provider[]; selected: string; past: SavedSession[]; panes: string[]; starting: boolean; busyIds:string[];
  onStart: () => void; onSelect: (id: string) => void; onOpen: (session: SavedSession) => void;
  onRename: (id:string,title:string) => Promise<void>; onDelete: (id:string) => Promise<void>;
}) {
  const [menu,setMenu]=useState<string|null>(null);
  const [dialog,setDialog]=useState<{kind:'rename'|'delete';chat:SavedSession}|null>(null);
  const [title,setTitle]=useState('');
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  function action(kind:'rename'|'delete',chat:SavedSession){setMenu(null);setError('');setTitle(chatTitle(chat));setDialog({kind,chat})}
  async function confirm(){
    if(!dialog || working)return;
    setWorking(true);setError('');
    try {
      if(dialog.kind==='rename')await onRename(dialog.chat.id,title.trim());
      else await onDelete(dialog.chat.id);
      setDialog(null);
    }catch(e){setError(String(e))}finally{setWorking(false)}
  }
  const selectedProvider=providers.find(p=>p.id===selected);
  return <><aside id="workspace-sidebar" className={collapsed?'collapsed':undefined} aria-label="Workspace sidebar">
    <div className="sidebar-heading">
      {!collapsed&&<h1>Agent Desk<span>LOCAL WORKSPACE</span></h1>}
      <button className="sidebar-toggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={()=>{setMenu(null);onToggle?.()}}><span aria-hidden="true">{collapsed?'»':'«'}</span></button>
    </div>
    <button className="new-session" aria-label="New session" title={`New session${selectedProvider?` · ${selectedProvider.name}`:''}`} disabled={starting || !providers.length} onClick={onStart}><span aria-hidden="true">＋</span>{!collapsed&&' New session'}</button>
    {!collapsed&&<select aria-label="Provider" value={selected} onChange={e => onSelect(e.target.value)}>
      {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>}
    <h3 className={collapsed?'sr-only':undefined}>History</h3>
    <nav aria-label="Conversation history">{!past.length && <small>No conversations yet.</small>}{past.map(s => <div className={'history-entry '+(panes.includes(s.id)?'selected':'')} key={s.id}>
      <div className="history-row">
        <button className="history-open" aria-label={`${chatTitle(s)} · ${s.provider}`} title={`${chatTitle(s)} · ${s.provider} · ${s.cwd}`} onClick={() => {setMenu(null);onOpen(s)}}>
          {collapsed?<span className="provider-icon" aria-hidden="true">{s.provider.trim().slice(0,2).toUpperCase()||'?'}</span>:<><span className="history-title">{chatTitle(s)}</span>
          <small>{s.provider} · {s.cwd.split(/[\\/]/).pop()}</small>
          <small>{[historyDate(s.updatedAt),!s.canResume?'Saved only':''].filter(Boolean).join(' · ')}</small></>}
        </button>
        {!collapsed&&<button className="history-more" aria-label={`Options for ${chatTitle(s)}`} aria-expanded={menu===s.id} onClick={() => setMenu(menu===s.id?null:s.id)}>⋯</button>}
      </div>
      {!collapsed && menu===s.id && <div className="history-options">
        <button onClick={() => action('rename',s)}>Rename</button>
        <button className="danger-text" disabled={busyIds.includes(s.id)} title={busyIds.includes(s.id)?'Stop the response or wait for reconnection before deleting.':undefined} onClick={() => action('delete',s)}>Delete chat…</button>
      </div>}
    </div>)}</nav>
  </aside>{dialog && <div className="overlay" onKeyDown={e => {if(e.key==='Escape'&&!working)setDialog(null)}}>
    <form className="history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-dialog-title" onSubmit={e => {e.preventDefault();void confirm()}}>
      <h2 id="history-dialog-title">{dialog.kind==='rename'?'Rename conversation':'Delete conversation?'}</h2>
      {dialog.kind==='rename'?<><label htmlFor="chat-title">One-line title</label><input id="chat-title" autoFocus value={title} maxLength={120} onChange={e => setTitle(e.target.value)}/></>:
        <><p><strong>{chatTitle(dialog.chat)}</strong></p><p>This removes the conversation and activity history from Agent Desk and closes its connection. This cannot be undone. The provider’s own saved session stays with the provider.</p></>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" autoFocus={dialog.kind==='delete'} disabled={working} onClick={() => setDialog(null)}>Cancel</button>
        <button className={dialog.kind==='delete'?'danger':'primary'} disabled={working||(dialog.kind==='rename'&&!title.trim())} type="submit">{working?'Saving…':dialog.kind==='rename'?'Save title':'Delete conversation'}</button>
      </div>
    </form>
  </div>}</>;
}
