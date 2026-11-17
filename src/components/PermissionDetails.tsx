import React from 'react';
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:undefined;
const kinds:Record<string,string>={read:'Read',edit:'Edit',delete:'Delete',move:'Move',search:'Search',execute:'Execute',think:'Think',fetch:'Fetch',switch_mode:'Switch mode',other:'Other'};
const statuses:Record<string,string>={pending:'Pending',in_progress:'In progress',completed:'Completed',failed:'Failed'};

// Describe the request snapshot, not a later tool update that may change its scope.
export function PermissionDetails({params,provider}:{params:unknown;provider:string}) {
  const request=record(params)?params:{};
  const tool=record(request.toolCall)?request.toolCall:{};
  const title=text(tool.title);
  const kind=text(tool.kind),status=text(tool.status);
  const locations=Array.isArray(tool.locations)?tool.locations.filter(record):[];
  const content=Array.isArray(tool.content)?tool.content:[];
  return <div className="permission-details">
    <small>{provider}{kind?` · ${kinds[kind]??kind}`:''}{status?` · ${statuses[status]??status}`:''}</small>
    {title?<><h5>Agent-provided description</h5><pre className="permission-description">{title}</pre></>:<p className="muted">The provider did not supply a description for this permission request.</p>}
    {locations.map((location,i)=>text(location.path)&&<p className="permission-location" key={i}>File: <code>{String(location.path)}</code>{typeof location.line==='number'?` · Line ${location.line}`:''}</p>)}
    {tool.rawInput!=null&&<><h5>Tool input supplied by provider</h5><pre>{typeof tool.rawInput==='string'?tool.rawInput:JSON.stringify(tool.rawInput,null,2)}</pre></>}
    {content.map((item,i)=>{
      if(!record(item))return null;
      if(item.type==='content'&&record(item.content)&&item.content.type==='text'&&typeof item.content.text==='string')return <pre key={i}>{item.content.text}</pre>;
      if(item.type==='diff')return <div key={i}><p className="permission-location">Proposed change: {text(item.path)??'Path not supplied'}</p><h5>Old text</h5><pre>{typeof item.oldText==='string'?item.oldText:'Not supplied'}</pre><h5>New text</h5><pre>{typeof item.newText==='string'?item.newText:'Not supplied'}</pre></div>;
      return <p className="muted" key={i}>Additional provider content is available in Technical details.</p>;
    })}
    <details className="permission-technical"><summary>Technical details</summary><pre>{JSON.stringify(request,null,2)}</pre></details>
  </div>;
}
