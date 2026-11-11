import React from 'react';
import {ActivityPanel} from '../ActivityPanel';
import type {ActivityEvent} from '../activity';
import type {Session} from '../types';
import {ErrorBoundary} from './ErrorBoundary';
export function SessionPane({session:s, onPermission, onCancel, onResume, resumeAvailable}: {
  session: Session; onResume: () => void; resumeAvailable: boolean; onPermission: (request: unknown, option: string | null) => Promise<void>; onCancel: () => void;
}) {
  const merged: ActivityEvent[] = [];
  for (const m of s.items.filter(m => ['user','delta','error'].includes(m.kind))) {
    if (m.kind === 'delta' && merged.at(-1)?.kind === 'delta') merged[merged.length-1].data += m.data;
    else merged.push({...m});
  }
  return <article>
    <div className="pane-title"><strong>{s.provider}</strong>
      <small>{s.resuming ? 'Reconnecting…' : s.live ? 'Connected' : 'Saved history'} · {s.id.slice(0,8)}</small><small>{s.cwd}</small>
    </div>
    {!s.live && <div className="resume-conversation">
      {s.canResume ? <><button disabled={s.resuming || !resumeAvailable} onClick={onResume}>{s.resuming ? 'Reconnecting…' : 'Continue conversation'}</button>
        <small>{resumeAvailable ? 'Restores this chat with its original provider and project.' : 'Restore the original provider configuration in Provider settings to continue this chat.'}</small></> :
        <small>This older chat has no recoverable provider session ID. You can read it here; new chats support continuing from history.</small>}
    </div>}
    <div className="messages">{merged.map((m,i) => <div key={i} className={'message '+m.kind}>
      <label>{m.kind === 'user' ? 'You' : m.kind === 'delta' ? s.provider : m.kind}</label><div>{String(m.data)}</div>
    </div>)}{s.busy && <p className="muted">Responding…</p>}</div>
    <ErrorBoundary key={s.id} label="Activity inspector">
      <ActivityPanel events={s.items} live={s.live} provider={s.provider} onPermission={onPermission}/>
    </ErrorBoundary>
    {s.busy && <button onClick={onCancel}>Stop response</button>}
  </article>;
}
