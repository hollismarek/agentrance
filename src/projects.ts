import type {Provider} from './types';
export function absoluteProject(path:string):boolean {
 return !path.includes('\0')&&(path.startsWith('/')||/^[A-Za-z]:[\\/]/.test(path)||path.startsWith('\\\\'));
}
export function projectChoices(recent:string[],providers:Provider[],history:{cwd:string}[]):string[]{
 return [...new Set([...recent,...providers.map(p=>p.cwd),...history.map(s=>s.cwd)].filter(path=>absoluteProject(path)))].slice(0,20);
}
export function initialProject(providers:Provider[],recent:string[]):string {
 return recent[0]??(providers.length&&providers.every(p=>p.cwd===providers[0].cwd)?providers[0].cwd:'');
}
export function providersAtProject(providers:Provider[],path:string):Provider[]{
 if(!absoluteProject(path))throw Error('Choose an absolute project folder.');
 return providers.map(provider=>({...provider,cwd:path}));
}
