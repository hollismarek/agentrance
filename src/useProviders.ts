import {useCallback,useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {defaultProviders, parseProviders} from './providers';
import {uniqueProvider} from './providerForms';
import type {Provider} from './types';

export function useProviders(setError:(message:string)=>void) {
  const [ready,setReady]=useState(false);
  const [detected,setDetected]=useState<Provider[]>([]);
  const [detecting,setDetecting]=useState(false);
  const [discoveryError,setDiscoveryError]=useState('');
  const discover=useCallback(async()=>{
    setDetecting(true);setDiscoveryError('');
    try{const found=await invoke<Provider[]>('discover_providers');setDetected(found);setDiscoveryError('');return found}
    catch(e){setDiscoveryError(`Could not check installed providers: ${e}`);return []}
    finally{setDetecting(false)}
  },[]);
  const [needsSetup,setNeedsSetup]=useState(false);
  const [channel,setChannel]=useState('');
  const [providers,setProviders]=useState<Provider[]>([]);
  const [selected,setSelected]=useState('');
  useEffect(() => {
    const scan=discover();
    Promise.all([invoke<string>('app_channel'),invoke<string>('startup_directory'),invoke<string|null>('load_provider_settings')]).then(async([value,cwd,stored])=>{
      setChannel(value);document.title=`Agentrance — ${value}`;
      let loaded=defaultProviders(cwd).map(p=>uniqueProvider(p,[],cwd));
      try {
        // Only Stable may import the original shared webview configuration.
        const legacy=stored===null&&value==='Stable'?localStorage.getItem('providers'):null;
        const raw=stored??legacy;
        if(raw)loaded=parseProviders(raw);
        else {const found=await scan;if(found.length)loaded=found.map(p=>uniqueProvider(p,[],cwd));setNeedsSetup(true)}
        if(legacy)await invoke('save_provider_settings',{raw:legacy});
      } catch(e){setNeedsSetup(true);setError(`Saved provider settings could not be loaded: ${e}. Existing saved data has been preserved; review Settings.`)}
      setProviders(loaded);setSelected(loaded[0].id);setReady(true);
    }).catch(e=>setError(`Could not load application settings: ${e}`));
  },[]);
  async function save(providers:Provider[]) {
    await invoke('save_provider_settings',{raw:JSON.stringify(providers,null,2)});
    setNeedsSetup(false);
    setProviders(providers);
    setSelected(current=>providers.some(p=>p.id===current)?current:providers[0].id);
  }
  return {ready,channel,providers,selected,setSelected,save,needsSetup,detected,detecting,discoveryError,discover};
}
