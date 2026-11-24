import React from 'react';
import {connectionDetails} from '../connectionDetails';
import {agentSelection,modelSelection} from '../agents';
import type {Session} from '../types';
import {SelectionDetails} from './SelectionDetails';

export function ConnectionDetails({session}:{session:Session}){
 const report=connectionDetails(session.items);
 const state=report.available?'Not advertised':'Unavailable';
 const rows=[
  ['Resume without replay',report.resume,'Used by Continue when advertised'],
  ['Load with replay',report.load,'Fallback for Continue and used to open provider sessions'],
  ['List provider sessions',report.list,'Open provider session also requires load support'],
  ['Image input',report.image,'Used for pasted screenshots and image attachments'],
  ['Embedded context',report.embeddedContext,'Used for binary file attachments'],
  ['Audio input',report.audio,'Audio prompts are unavailable in Agentrance'],
  ['MCP over HTTP',report.mcpHttp,'Agentrance supplies no MCP servers'],
  ['MCP over SSE',report.mcpSse,'Agentrance supplies no MCP servers'],
 ] as const;
 return <section className="connection-inspector">
  <p>{report.available?(session.live&&!session.resuming?'Current ACP connection':'Last recorded ACP connection'):'No ACP handshake was saved for this conversation.'}</p>
  <dl className="connection-fields">
   <dt>Provider</dt><dd>{report.providerName??session.provider}{report.providerVersion&&` · ${report.providerVersion}`}</dd>
   <dt>ACP version</dt><dd>{report.protocolVersion??'Unavailable'}</dd>
  </dl>
  <h4>Provider capabilities</h4>
  <dl className="connection-fields">
   {rows.map(([label,advertised,client])=><React.Fragment key={label}>
    <dt>{label}</dt><dd>{advertised?'Advertised':state} <small>{client}</small></dd>
   </React.Fragment>)}
   <dt>Extension metadata keys</dt><dd>{report.extensions.join(', ')||state}</dd>
  </dl>
  <h4>Session configuration</h4>
  <p>Agentrance can change the agent and model when the session offers choices.</p>
  <SelectionDetails agent={agentSelection(session.items)} model={modelSelection(session.items)}/>
  {report.options.length>0&&<ul>{report.options.map((option,index)=>
   <li key={index}>{typeof option.name==='string'?option.name:typeof option.id==='string'?option.id:'Unnamed option'}{typeof option.category==='string'&&` · ${option.category}`}</li>)}</ul>}
  <h4>Tool approvals</h4>
  <p>{report.permissionRequested?'The provider requested approval on this connection.':'No approval requests recorded for this connection.'} The provider decides which operations require approval. Agentrance asks you to answer each live request.</p>
  {report.available&&<details>
   <summary>Advertised capabilities (JSON)</summary>
   <pre>{JSON.stringify(report.capabilities,null,2)}</pre>
  </details>}
 </section>;
}
