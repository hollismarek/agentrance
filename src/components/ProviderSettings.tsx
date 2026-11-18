import React,{useEffect,useRef,useState} from 'react';
import type {Provider} from '../types';
import type {ThemePreference} from '../theme';
import {toProviderForm,providersFromForms,uniqueProvider,providerIsConfigured,providerPreset,type ProviderForm} from '../providerForms';
export function ProviderSettings({providers,onSave,onClose,theme='system',onTheme,detected=[],detecting=false,discoveryError='',onDiscover}: {
  providers:Provider[];onSave:(p:Provider[])=>Promise<void>;onClose:()=>void;
  theme?:ThemePreference;onTheme?:(value:ThemePreference)=>void;
  detected?:Provider[];detecting?:boolean;discoveryError?:string;onDiscover?:()=>Promise<Provider[]>;
}) {
  const [forms,setForms]=useState(()=>providers.map(toProviderForm));
  const [sharedProject,setSharedProject]=useState(providers[0]?.cwd??'');
  const [kind,setKind]=useState<Parameters<typeof providerPreset>[0]>('custom');
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const dialog=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLElement>('select,input,button')?.focus();
    return()=>previous?.focus();
  },[]);
  function update(index:number,patch:Partial<ProviderForm>){setForms(all=>all.map((p,i)=>i===index?{...p,...patch}:p))}
  function add(provider:Provider){setForms(all=>[...all,toProviderForm(uniqueProvider(provider,all,sharedProject||all[0]?.cwd||''))])}
  async function save(){
    if(saving)return;setSaving(true);setError('');
    try{await onSave(providersFromForms(forms))}catch(e){setError(String(e))}finally{setSaving(false)}
  }
  function keyboard(e:React.KeyboardEvent){
    if(e.key==='Escape'&&!saving){e.preventDefault();onClose()}
    if(e.key!=='Tab')return;
    const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled),summary')??[]).filter(el=>el.getClientRects().length>0);
    const first=elements[0],last=elements.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
  }
  return <div className="overlay settings-overlay"><form ref={dialog} className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={keyboard} onSubmit={e=>{e.preventDefault();void save()}}>
    <div className="settings-heading"><h2 id="settings-title">Settings</h2><button type="button" disabled={saving} onClick={onClose}>Close</button></div>
    <section className="settings-section"><h3>Appearance</h3>
      <label className="settings-field">Theme<select aria-label="Appearance" value={theme} onChange={e=>onTheme?.(e.target.value as ThemePreference)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <p className="muted">System follows your OS. Appearance changes apply immediately and are saved separately for Stable and Development.</p>
    </section>
    <section className="settings-section"><h3>Installed providers</h3>
      <p>Known ACP launchers are detected without starting them. Sign in with each provider’s CLI separately. Codex needs the codex-acp adapter; the codex command alone is not an ACP launcher.</p>
      <button type="button" disabled={detecting||saving||!onDiscover} onClick={()=>{void onDiscover?.()}}>{detecting?'Checking…':'Check again'}</button>
      {discoveryError&&<p role="status" className="muted">{discoveryError} You can still add a provider manually.</p>}
      {!detecting&&!detected.length&&<p className="muted">No supported launchers found in the checked locations. Add one below if it is installed elsewhere.</p>}
      <ul className="detected-providers">{detected.map(p=>{
        const configured=providerIsConfigured(p,forms);
        return <li key={p.id}><div><strong>{p.name}</strong><small>{p.executable}</small></div><button type="button" disabled={configured||saving} onClick={()=>add(p)}>{configured?'Added':`Add ${p.name}`}</button></li>;
      })}</ul>
    </section>
    <fieldset disabled={saving} className="provider-editor"><legend>Providers</legend>
      <p>Choose an existing absolute project folder. Changes here apply when you save; existing conversations keep their original project. Removing a provider does not delete chats.</p>
      <div className="shared-project"><label className="settings-field">Project folder for all providers<input value={sharedProject} placeholder="Absolute path to your project folder" onChange={e=>setSharedProject(e.target.value)}/></label><button type="button" disabled={!sharedProject.trim()} onClick={()=>setForms(all=>all.map(p=>({...p,cwd:sharedProject})))}>Use for all</button></div>
      {forms.map((p,index)=><section className="provider-card" key={p.id} aria-label={`Provider ${index+1}`}>
        <div className="provider-card-heading"><h4>{p.name||`Provider ${index+1}`}</h4><button type="button" disabled={forms.length===1} onClick={()=>setForms(all=>all.filter((_,i)=>i!==index))}>Remove provider</button></div>
        <div className="provider-fields">
          <label className="settings-field">Display name<input aria-label={`Display name for provider ${index+1}`} value={p.name} onChange={e=>update(index,{name:e.target.value})}/></label>
          <label className="settings-field">Executable<input aria-label={`Executable for provider ${index+1}`} value={p.executable} placeholder="Provider executable or absolute path" onChange={e=>update(index,{executable:e.target.value})}/></label>
          <label className="settings-field provider-project">Project folder<input aria-label={`Project directory for ${p.name||`provider ${index+1}`}`} value={p.cwd} placeholder="Absolute path to your project folder" onChange={e=>update(index,{cwd:e.target.value})}/></label>
        </div>
        <div className="argument-editor"><h5>Arguments</h5><p className="muted">One argument per field; spaces stay part of that argument. Do not add shell quotes.</p>
          {p.args.map((arg,i)=><div className="settings-row" key={i}><input aria-label={`Argument ${i+1} for provider ${index+1}`} value={arg} onChange={e=>update(index,{args:p.args.map((value,j)=>i===j?e.target.value:value)})}/><button type="button" aria-label={`Remove argument ${i+1} for provider ${index+1}`} onClick={()=>update(index,{args:p.args.filter((_,j)=>j!==i)})}>Remove</button></div>)}
          <button type="button" onClick={()=>update(index,{args:[...p.args,'']})}>Add argument</button>
        </div>
        <details className="environment-editor"><summary>Environment overrides ({p.env.length})</summary><p className="muted">Optional. Use existing CLI login; do not enter account credentials here.</p>
          {p.env.map((row,i)=><div className="settings-row environment-row" key={i}><input aria-label={`Environment name ${i+1} for provider ${index+1}`} placeholder="Variable name" value={row.key} onChange={e=>update(index,{env:p.env.map((value,j)=>i===j?{...value,key:e.target.value}:value)})}/><input aria-label={`Environment value ${i+1} for provider ${index+1}`} placeholder="Value" value={row.value} onChange={e=>update(index,{env:p.env.map((value,j)=>i===j?{...value,value:e.target.value}:value)})}/><button type="button" aria-label={`Remove environment variable ${i+1} for provider ${index+1}`} onClick={()=>update(index,{env:p.env.filter((_,j)=>j!==i)})}>Remove</button></div>)}
          <button type="button" onClick={()=>update(index,{env:[...p.env,{key:'',value:''}]})}>Add environment variable</button>
        </details>
      </section>)}
      <div className="settings-row"><label className="settings-field">Provider type<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="custom">Custom ACP provider</option><option value="kiro">Kiro CLI</option><option value="codex">Codex ACP adapter</option><option value="gemini">Gemini CLI</option><option value="opencode">OpenCode</option><option value="copilot">GitHub Copilot CLI</option></select></label><button type="button" onClick={()=>add(providerPreset(kind))}>Add provider</button></div>
      <p className="muted">An absolute executable path is most reliable. On Windows, use a native .exe or node.exe with the adapter’s JavaScript entry file as its first argument, rather than .cmd/.bat wrappers.</p>
    </fieldset>
    {error&&<p role="alert" className="error">{error}</p>}
    <div className="dialog-actions"><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save settings'}</button></div>
  </form></div>;
}
