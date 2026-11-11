import React, {useEffect, useMemo, useState} from 'react';
import {activityKinds, commandText, elapsed, operationOutput, reduceActivity, type ActivityEvent} from './activity';
const labels: Record<string,string> = {pending:'Pending', running:'Running', awaiting:'Awaiting approval', completed:'Completed', failed:'Failed', interrupted:'No final result', declined:'Declined'};
export function ActivityPanel({events, live, provider, onPermission}: {
  events: ActivityEvent[]; live: boolean; provider: string;
  onPermission: (request: any, option: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState<string[]>([]);
  const [error, setError] = useState('');
  const activity = useMemo(() => events.filter(e => activityKinds.has(e.kind)), [events]);
  const operations = useMemo(() => reduceActivity(activity, live), [activity, live]);
  const awaiting = operations.reduce((n, op) => n + op.approvals.filter(a => !a.decision && !a.expired).length, 0);
  const running = operations.filter(op => op.status === 'running').length;
  useEffect(() => {if (awaiting) setOpen(true)}, [awaiting]);
  useEffect(() => {
    if (!open || !operations.some(op => op.started !== undefined && ['running','awaiting','pending'].includes(op.status))) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [open, operations]);
  async function decide(request: any, option: string | null) {
    const key = JSON.stringify(request);
    setSending(a => [...a, key]);setError('');
    try {await onPermission(request, option)} catch (e) {setError(String(e))}
    finally {setSending(a => a.filter(x => x !== key))}
  }
  return <section className="activity-panel" aria-label={`${provider} activity inspector`}>
    <button className="activity-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span>{open ? '▾' : '▸'} Activity <span className="activity-count">{operations.length}</span></span>
      <span>{awaiting > 0 && <span className="status awaiting">{awaiting} awaiting approval</span>} {running > 0 && <span className="status running">{running} running</span>}</span>
    </button>
    {open && <div className="activity-body">
      <p className="activity-note">Live provider reports · read-only inspector. Output appears as the agent supplies it.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {!operations.length && <p className="muted">No tool activity reported yet.</p>}
      {operations.map(op => {
        const output = operationOutput(op);const command = commandText(op);
        return <details className={`operation ${op.status}`} key={op.id}>
          <summary><span className={`status ${op.status}`}>{labels[op.status]}</span><strong>{op.title}</strong><small>{elapsed(op, now)}</small></summary>
          <div className="operation-body">
            <small>{op.kind || 'Tool'} · {op.id} · {provider}</small>
            {command ? <><h4>Reported command</h4><pre>{command}</pre></> : op.kind === 'execute' && <p className="muted">Command not exposed by provider.</p>}
            <h4>Output</h4>
            {output.stdout !== undefined && <><h5>stdout</h5><pre>{output.stdout || '(empty)'}</pre></>}
            {output.stderr !== undefined && <><h5>stderr</h5><pre>{output.stderr || '(empty)'}</pre></>}
            {output.text && <><h5>Tool output · stream not identified by provider</h5><pre>{output.text}</pre></>}
            {output.stdout === undefined && output.stderr === undefined && <p className="muted">Raw stdout/stderr not exposed by provider.</p>}
            {!output.text && output.raw == null && <p className="muted">No output reported{['running','pending','awaiting'].includes(op.status) ? ' yet' : ''}.</p>}
            {output.terminals.length > 0 && <p className="muted">Provider referenced terminal {output.terminals.join(', ')}. Terminal output is unavailable; Agent Desk does not offer a terminal execution capability.</p>}
            <small>Exit code: {output.exitCode ?? 'not reported'} · {elapsed(op, now)}</small>
            {op.approvals.map((a, i) => <div className="approval-record" key={i}>
              <h4>{a.decision ? 'Permission decision' : a.expired ? 'Past permission request' : 'Permission required'}</h4>
              <pre>{JSON.stringify(a.params.toolCall, null, 2)}</pre>
              {a.decision ? <p>{a.decision.optionName || (a.decision.option == null ? 'Denied / cancelled' : a.decision.option)}{a.decision.optionKind ? ` (${a.decision.optionKind})` : ''} · sent to provider</p> : a.expired ? <p className="muted">Request is no longer active.</p> : <div className="approval-buttons">{(a.params.options || []).map((o: any) => <button key={o.optionId} disabled={sending.includes(JSON.stringify(a.request))} onClick={() => decide(a.request,o.optionId)}>{o.name}<small>{o.kind}</small></button>)}<button disabled={sending.includes(JSON.stringify(a.request))} onClick={() => decide(a.request,null)}>Deny</button></div>}
            </div>)}
            <details><summary>Provider details and update history ({op.updates.length})</summary>
              <p className="muted">Each update is retained. Content and raw output are provider snapshots, not assumed to be append-only streams.</p>
              {op.updates.map((u,i) => <div key={i}><small>{u.at ? new Date(u.at).toLocaleTimeString() : 'Timestamp unavailable'} · {u.kind}</small><pre>{JSON.stringify(u.data,null,2)}</pre></div>)}
            </details>
          </div>
        </details>;
      })}
    </div>}
  </section>;
}
