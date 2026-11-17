import React, {useState} from 'react';
import type {Provider} from '../types';
import {parseProviders} from '../providers';
export function ProviderSettings({providers, onSave, onClose}: {providers: Provider[]; onSave: (p: Provider[]) => Promise<void>; onClose: () => void}) {
  const [config,setConfig] = useState(JSON.stringify(providers,null,2));
  const [error,setError] = useState('');
  const [saving,setSaving]=useState(false);
  let entries:unknown[]=[];
  try {const parsed:unknown=JSON.parse(config);if(Array.isArray(parsed))entries=parsed}catch{}
  function project(index:number,cwd:string){setConfig(JSON.stringify(entries.map((p,i)=>i===index?{...(p as object),cwd}:p),null,2))}
  async function save(){if(saving)return;setSaving(true);try{await onSave(parseProviders(config))}catch(e){setError(String(e))}finally{setSaving(false)}}
  return <div className="overlay"><div className="settings" role="dialog" aria-modal="true" aria-labelledby="providers-title">
    <h2 id="providers-title">Providers</h2>
    <p>Set each executable, argument list, environment overrides, and absolute project directory. Use existing CLI login; do not put credentials here.</p>
    <p>Choose your project explicitly before starting a session. Saved conversations keep their original project directory.</p>
    <p>Desktop apps may not share your terminal’s PATH. An absolute executable path is most reliable. On Windows, use a native .exe; for npm providers use node.exe with the provider’s JavaScript entry file first in args, rather than a .cmd/.bat wrapper.</p>
    <div className="provider-projects">{entries.map((entry,index)=>{
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
      const p=entry as Record<string,unknown>;
      return <label key={index}>Project directory · {typeof p.name==='string'?p.name:`Provider ${index+1}`}<input aria-label={`Project directory for ${typeof p.name==='string'?p.name:`provider ${index+1}`}`} placeholder="Absolute path to your project folder" value={typeof p.cwd==='string'?p.cwd:''} onChange={e=>project(index,e.target.value)}/></label>;
    })}</div>
    {error && <p role="alert" className="error">{error}</p>}
    <textarea aria-label="Provider configuration" value={config} onChange={e => setConfig(e.target.value)}/>
    <button onClick={onClose}>Cancel</button><button disabled={saving} onClick={save}>{saving?'Saving…':'Save providers'}</button>
  </div></div>;
}
