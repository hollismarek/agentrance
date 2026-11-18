import type {Provider} from './types';
import {parseProviders} from './providers';
export type ProviderForm=Omit<Provider,'env'>&{env:{key:string;value:string}[]};
export const toProviderForm=(p:Provider):ProviderForm=>({...p,args:[...p.args],env:Object.entries(p.env).map(([key,value])=>({key,value}))});
export function providersFromForms(forms:ProviderForm[]):Provider[]{
  const values=forms.map((form,index)=>{
    if(!form.name.trim())throw Error(`Provider ${index+1}: enter a display name.`);
    if(!form.executable.trim())throw Error(`Provider ${index+1} (${form.name}): enter the provider executable.`);
    if(!form.cwd.trim())throw Error(`Provider ${index+1} (${form.name}): enter a project folder.`);
    const keys=new Set<string>();
    const env:Record<string,string>=Object.create(null);
    for(const row of form.env){
      if(!row.key.trim()||row.key.includes('=')||row.key.includes('\0'))throw Error(`Provider ${index+1}: enter an environment variable name without '=' or null characters.`);
      if(keys.has(row.key))throw Error(`Provider ${index+1}: duplicate environment variable ${row.key}.`);
      keys.add(row.key);env[row.key]=row.value;
    }
    return {...form,env};
  });
  return parseProviders(JSON.stringify(values));
}
export function uniqueProvider(p:Provider,existing:{id:string}[],cwd:string):Provider{
  let id=p.id;let suffix=2;
  while(existing.some(value=>value.id===id))id=`${p.id}-${suffix++}`;
  return {...p,id,args:[...p.args],env:{...p.env},cwd};
}
export function providerIsConfigured(candidate:Provider,providers:ProviderForm[]):boolean{
  return providers.some(p=>p.executable===candidate.executable&&JSON.stringify(p.args)===JSON.stringify(candidate.args));
}
export function providerPreset(kind:'kiro'|'codex'|'custom'):Provider {
  return kind==='kiro'?{id:'kiro',name:'Kiro CLI',executable:'kiro-cli',args:['acp','--agent-engine=v3'],env:{},cwd:''}:
    kind==='codex'?{id:'codex-acp',name:'Codex (ACP)',executable:'codex-acp',args:[],env:{},cwd:''}:
    {id:'custom',name:'Custom ACP provider',executable:'',args:[],env:{},cwd:''};
}
