import React from 'react';
import {agentName,modelSelection} from '../agents';
import type {ActivityEvent} from '../activity';
import type {Session} from '../types';

const formatCount=new Intl.NumberFormat();
const formatCost=new Intl.NumberFormat(undefined,{maximumSignificantDigits:12});

export function SessionUsage({session}:{session:Session}){
 let usage:ActivityEvent|undefined,handshake:ActivityEvent|undefined;
 for(let index=session.items.length-1;index>=0;index--){
  const event=session.items[index];
  if(!usage&&event.kind==='session_usage')usage=event;
  if(!handshake&&(event.kind==='identity'||event.kind==='connection_started'))handshake=event;
  if(usage&&handshake)break;
 }
 const report=usage?.data;
 const current=!!report&&session.live&&!session.resuming&&typeof report.agentranceConnectionId==='string'&&
  report.agentranceConnectionId===handshake?.data?.agentranceConnectionId;
 const context=Number.isSafeInteger(report?.used)&&report.used>=0&&Number.isSafeInteger(report.size)&&report.size>=0;
 const cost=report?.cost;
 const costAvailable=Number.isFinite(cost?.amount)&&cost.amount>=0&&typeof cost.currency==='string'&&!!cost.currency.trim();
 return <section>
  <p>{current?'Latest ACP report for this connection.':report?'Last recorded ACP usage report.':'No ACP usage update has been received for this conversation.'}</p>
  <dl className="connection-fields">
   <dt>{session.live?'Selected model':'Last selected model'}</dt><dd>{agentName(modelSelection(session.items))??'Unavailable'}</dd>
   <dt>Context used</dt><dd>{context?`${formatCount.format(report.used)} / ${formatCount.format(report.size)} tokens`:'Unavailable'}</dd>
   <dt>Session cost</dt><dd>{costAvailable?`${formatCost.format(cost.amount)} ${cost.currency}`:'Unavailable'}</dd>
  </dl>
  <p className="muted">Context counts describe the conversation’s context window. Session cost is the cumulative amount reported by the provider. Account balances are outside ACP session reporting.</p>
 </section>;
}
