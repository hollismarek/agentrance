import React, {useState} from 'react';
import type {Provider} from '../types';
import {parseProviders} from '../providers';
export function ProviderSettings({providers, onSave, onClose}: {providers: Provider[]; onSave: (p: Provider[]) => Promise<void>; onClose: () => void}) {
  const [config,setConfig] = useState(JSON.stringify(providers,null,2));
  const [error,setError] = useState('');
  const [saving,setSaving]=useState(false);
  async function save(){if(saving)return;setSaving(true);try{await onSave(parseProviders(config))}catch(e){setError(String(e))}finally{setSaving(false)}}
  return <div className="overlay"><div className="settings" role="dialog" aria-modal="true" aria-labelledby="providers-title">
    <h2 id="providers-title">Providers</h2>
    <p>Set each executable, argument list, environment overrides, and absolute project directory. Use existing CLI login; do not put credentials here.</p>
    {error && <p role="alert" className="error">{error}</p>}
    <textarea aria-label="Provider configuration" value={config} onChange={e => setConfig(e.target.value)}/>
    <button onClick={onClose}>Cancel</button><button disabled={saving} onClick={save}>{saving?'Saving…':'Save providers'}</button>
  </div></div>;
}
