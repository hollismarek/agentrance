// Local development fixture. Not part of the shipped application entry point.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActivityPanel} from '../src/ActivityPanel';
import type {ActivityEvent} from '../src/activity';
import '../src/style.css';
function Preview(){
 const [events,setEvents]=useState<ActivityEvent[]>([]);
 (window as any).feed=(e:ActivityEvent)=>setEvents(a=>[...a,e]);
 (window as any).decisions=[];
 return <div style={{width:740,height:800,padding:24,display:'flex',flexDirection:'column'}}><h1>Agent Desk</h1><p>Conversation continues above the inspector.</p><div style={{flex:1}}>Kiro CLI · independent session</div><ActivityPanel events={events} provider="Kiro CLI" live={true} onPermission={async(request,option)=>{
  (window as any).decisions.push({request,option});
  setEvents(a=>[...a,{kind:'permission_resolved',at:Date.now(),data:{request,option,optionKind:option==='allow'?'allow_once':null,optionName:option==='allow'?'Allow once':null}}]);
 }}/></div>
}createRoot(document.getElementById('root')!).render(<Preview/>);
