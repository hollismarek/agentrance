import React from 'react';
import {AttachmentPicker} from './AttachmentPicker';
import type {Attachment} from '../attachments';
export function Composer({text,onText,onSend,canSend,label='Message',sendLabel='Send',attachments=[],onAttachments,onAttachmentBusy}: {
  onAttachmentBusy?:(busy:boolean)=>void;attachments?:Attachment[];onAttachments?:(files:Attachment[])=>void;
  text:string;onText:(text:string)=>void;onSend:()=>void;canSend:boolean;label?:string;sendLabel?:string;
}) {
  return <footer>
    <textarea rows={3} ref={element=>{
      if(!element)return;
      // Recalculate after controlled text changes and when the pane width changes.
      const fit=()=>{element.style.height='0px';element.style.height=`${element.scrollHeight+element.offsetHeight-element.clientHeight}px`};
      fit();
      let width=element.getBoundingClientRect().width;
      const observer=new ResizeObserver(()=>{
        const nextWidth=element.getBoundingClientRect().width;
        if(nextWidth!==width){width=nextWidth;fit()}
      });
      observer.observe(element);
      return ()=>observer.disconnect();
    }} aria-label={label} title="Enter to send · Shift+Enter for a new line" placeholder="Ask a question about your project…" value={text} onChange={e=>onText(e.target.value)}
      onKeyDown={e=>{if(e.key!=='Enter'||e.shiftKey||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;e.preventDefault();if(canSend&&!e.repeat)onSend();}}/>
    {onAttachments&&<AttachmentPicker onBusy={onAttachmentBusy} files={attachments} onFiles={onAttachments}/>}
    <div className="composer-actions"><button className="primary" disabled={!canSend} onClick={onSend}>{sendLabel}</button></div>
  </footer>;
}
