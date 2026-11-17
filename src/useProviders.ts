import {useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {defaultProviders, parseProviders} from './providers';
import type {Provider} from './types';

export function useProviders(setError:(message:string)=>void) {
  const [channel,setChannel]=useState('');
  const [providers,setProviders]=useState<Provider[]>([]);
  const [selected,setSelected]=useState('');
  useEffect(() => {
    Promise.all([invoke<string>('app_channel'),invoke<string>('startup_directory'),invoke<string|null>('load_provider_settings')]).then(async([value,cwd,stored])=>{
      setChannel(value);document.title=`Agentrance — ${value}`;
      let loaded=defaultProviders(cwd);
      try {
        // Only Stable may import the original shared webview configuration.
        const legacy=stored===null&&value==='Stable'?localStorage.getItem('providers'):null;
        const raw=stored??legacy;
        if(raw)loaded=parseProviders(raw);
        if(legacy)await invoke('save_provider_settings',{raw:legacy});
      } catch(e){setError(`Saved provider settings could not be loaded: ${e}. Existing saved data has been preserved; review Provider settings.`)}
      setProviders(loaded);setSelected(loaded[0].id);
    }).catch(e=>setError(`Could not load application settings: ${e}`));
  },[]);
  async function save(providers:Provider[]) {
    await invoke('save_provider_settings',{raw:JSON.stringify(providers,null,2)});
    setProviders(providers);
    setSelected(providers[0].id);
  }
  return {channel,providers,selected,setSelected,save};
}
