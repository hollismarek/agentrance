import type {Provider} from './types';
export function parseProviders(raw: string): Provider[] {
  const providers: unknown = JSON.parse(raw);
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!Array.isArray(providers) || !providers.length) throw Error('Configure at least one provider.');
  const ids = new Set<string>();
  for (const p of providers) {
    if (!record(p) || typeof p.id !== 'string' || typeof p.cwd !== 'string' || ['id','name','executable','cwd'].some(k => typeof p[k] !== 'string' || !p[k].trim()) ||
        !Array.isArray(p.args) || p.args.some(a => typeof a !== 'string') || !record(p.env) ||
        Object.entries(p.env).some(([k,v]) => !k || k.includes('=') || typeof v !== 'string')) {
      throw Error('Each provider needs an id, name, executable, argument list, environment object with string values, and project directory.');
    }
    if (!p.cwd.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p.cwd) && !p.cwd.startsWith('\\\\')) throw Error('Project directories must be absolute paths.');
    if (ids.has(p.id)) throw Error(`Duplicate provider id: ${p.id}`);
    ids.add(p.id);
  }
  return providers as Provider[];
}
export function defaultProviders(cwd: string): Provider[] {
  return [{id:'kiro',name:'Kiro CLI',executable:'kiro-cli',args:['acp','--agent-engine=v3'],env:{},cwd}];
}

export function resumeProvider(providers:Provider[], saved:{providerId?:string|null;provider:string}):Provider|undefined {
  const matches=providers.filter(p => saved.providerId ? p.id===saved.providerId : p.name===saved.provider);
  return matches.length===1 ? matches[0] : undefined;
}
