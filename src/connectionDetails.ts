import type {ActivityEvent} from './activity';

function record(value:unknown):Record<string,unknown> {
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

export function connectionDetails(events:ActivityEvent[]){
 let handshake:Record<string,unknown>={};
 let permissionRequested=false;
 let options:Record<string,unknown>[]=[];
 let revision=-1;
 for(let i=events.length-1;i>=0;i--){
  const {kind,data}=events[i];
  if(kind==='identity'||kind==='connection_started'){
   handshake=record(data);
   break;
  }
  if(kind==='permission')permissionRequested=true;
  if(kind==='agent_state'){
   const state=record(data);
   if(typeof state.revision==='number'&&state.revision>revision){
    revision=state.revision;
    options=Array.isArray(state.configOptions)?state.configOptions.map(record):[];
   }
  }
 }
 const capabilities=record(handshake.agentCapabilities);
 const prompt=record(capabilities.promptCapabilities);
 const sessions=record(capabilities.sessionCapabilities);
 const mcp=record(capabilities.mcpCapabilities);
 const info=record(handshake.agentInfo);
 const advertised=(value:unknown)=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const load=capabilities.loadSession===true;
 const resume=advertised(sessions.resume);
 const list=advertised(sessions.list);
 const extensions=[...new Set([...Object.keys(record(handshake._meta)),...Object.keys(record(capabilities._meta))])];
 return {
  available:Object.keys(handshake).length>0,
  providerName:typeof info.title==='string'?info.title:typeof info.name==='string'?info.name:null,
  providerVersion:typeof info.version==='string'?info.version:null,
  protocolVersion:typeof handshake.protocolVersion==='number'?handshake.protocolVersion:null,
  load,resume,list,image:prompt.image===true,audio:prompt.audio===true,embeddedContext:prompt.embeddedContext===true,
  mcpHttp:mcp.http===true,mcpSse:mcp.sse===true,extensions,capabilities,
  permissionRequested,options,
 };
}
