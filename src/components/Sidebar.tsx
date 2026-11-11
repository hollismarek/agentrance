import React from 'react';
import type {Provider, SavedSession} from '../types';
export function Sidebar({providers, selected, past, panes, starting, onStart, onSelect, onOpen, onSettings}: {
  providers: Provider[]; selected: string; past: SavedSession[]; panes: string[]; starting: boolean;
  onStart: () => void; onSelect: (id: string) => void; onOpen: (session: SavedSession) => void; onSettings: () => void;
}) {
  return <aside>
    <h1>Agent Desk<span>LOCAL WORKSPACE</span></h1>
    <button disabled={starting || !providers.length} onClick={onStart}>＋ New session</button>
    <select aria-label="Provider" value={selected} onChange={e => onSelect(e.target.value)}>
      {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <h3>History</h3>
    <nav>{past.map(s => <button className={panes.includes(s.id) ? 'active' : ''} key={s.id} onClick={() => onOpen(s)}>
      {s.provider}<small>{s.cwd.split(/[\\/]/).pop()} · {s.id.slice(0,8)}</small>
    </button>)}</nav>
    <button onClick={onSettings}>Provider settings</button>
    <small>Authentication stays with your CLI.<br/>No app telemetry.</small>
  </aside>;
}
