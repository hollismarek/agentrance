import type {ActivityEvent} from './activity';
export type AgentChoice={id:string;name:string;description?:string|null};
export type AgentSelection={current:string|null;choices:AgentChoice[]};
export function agentSelection(events:ActivityEvent[]):AgentSelection|null {
  let revision=-1;
  let selection:AgentSelection|null=null;
  for(const e of events) {
    if(e?.kind==='connection_started'){selection=null;revision=-1;}
    if(e?.kind!=='agent_state')continue;
    const report=e.data;
    if(typeof report?.revision!=='number' || report.revision<revision)continue;
    revision=report.revision;
    const data=report.selection;
    if(!data || !Array.isArray(data.choices)){selection=null;continue;}
    const choices:AgentChoice[]=data.choices.filter((c:any)=>c && typeof c.id==='string' && typeof c.name==='string').map((c:any)=>({id:c.id,name:c.name,description:typeof c.description==='string'?c.description:null}));
    selection={current:typeof data.current==='string'?data.current:null,choices};
  }
  return selection;
}
export function agentName(selection:AgentSelection|null):string|null {
  if(!selection?.current)return null;
  return selection.choices.find(c=>c.id===selection.current)?.name || selection.current;
}
