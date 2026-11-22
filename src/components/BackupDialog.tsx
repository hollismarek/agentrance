import React, {useEffect, useRef, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {open, save} from '@tauri-apps/plugin-dialog';

const filters = [{name:'Agentrance backup', extensions:['zip']}];

export function BackupDialog({onClose, flushWorkspace}: {onClose:()=>void; flushWorkspace:()=>Promise<void>}) {
  const panel = useRef<HTMLDivElement>(null);
  const [archive,setArchive] = useState<string|null>(null);
  const [pending,setPending] = useState<boolean|null>(null);
  const [busy,setBusy] = useState(false);
  const [status,setStatus] = useState('');
  const [error,setError] = useState('');

  useEffect(()=>{
    const previous = document.activeElement as HTMLElement|null;
    panel.current?.querySelector('button')?.focus();
    let active = true;
    void invoke<boolean>('backup_restore_pending').then(value=>{
      if(active)setPending(value);
    }).catch(reason=>{
      if(active)setError(String(reason));
    });
    return ()=>{active=false;previous?.focus()};
  },[]);

  async function run(action:()=>Promise<void>) {
    setBusy(true);
    setError('');
    setStatus('');
    try {await action()}
    catch(reason){setError(String(reason))}
    finally{setBusy(false)}
  }

  function makeBackup(){
    void run(async()=>{
      const destination = await save({
        title:'Save Agentrance backup',
        defaultPath:`agentrance-${new Date().toISOString().slice(0,10)}.zip`,
        filters,
      });
      if(!destination)return;
      await flushWorkspace();
      await invoke('create_backup',{destination});
      setStatus(`Backup saved to ${destination}`);
    });
  }

  function chooseBackup(){
    void run(async()=>{
      const path = await open({title:'Choose an Agentrance backup',filters,multiple:false});
      if(typeof path==='string')setArchive(path);
    });
  }

  function restoreBackup(){
    if(!archive)return;
    void run(async()=>{
      await invoke('stage_backup_restore',{archive});
      setArchive(null);
      setPending(true);
    });
  }

  return <div className="overlay help-overlay"><div className="history-dialog backup-dialog" ref={panel}
    role="dialog" aria-modal="true" aria-labelledby="backup-title" onKeyDown={event=>{
      if(event.key==='Escape'&&!busy){event.preventDefault();onClose()}
      if(event.key!=='Tab')return;
      const buttons=Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    }}>
    <h2 id="backup-title">Backup &amp; Restore</h2>
    <p>Backups include conversation history, provider settings, and saved text drafts. Keep the ZIP private. Provider sign-ins and attachment files stay on their original machine.</p>
    {pending&&<p role="status">Restore is staged. Quit and reopen Agentrance to use the restored profile. Your current profile is kept separately.</p>}
    {archive&&<div>
      <p>On the next launch, Agentrance will open the conversations, settings, and drafts from this backup. Your current profile stays on disk. Only restore a backup you trust.</p>
      <p className="backup-path">{archive}</p>
    </div>}
    {busy&&<p role="status">Working…</p>}
    {status&&<p className="backup-path" role="status">{status}</p>}
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="dialog-actions">
      {archive?<>
        <button disabled={busy} onClick={()=>setArchive(null)}>Cancel</button>
        <button disabled={busy} className="primary" onClick={restoreBackup}>Restore on next launch</button>
      </>:<>
        <button disabled={busy} onClick={onClose}>Close</button>
        <button disabled={busy||pending!==false} onClick={chooseBackup}>Restore backup…</button>
        <button disabled={busy} className="primary" onClick={makeBackup}>Create backup…</button>
      </>}
    </div>
  </div></div>;
}
