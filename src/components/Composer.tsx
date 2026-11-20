import React from 'react';
import {AttachmentPicker,type AttachmentPickerHandle} from './AttachmentPicker';
import type {Attachment} from '../attachments';
export function Composer({text,onText,onSend,canSend,label='Message',sendLabel='Send',attachments=[],onAttachments,onAttachmentBusy,secondaryAction}: {
  secondaryAction?:React.ReactNode;
  onAttachmentBusy?:(busy:boolean)=>void;attachments?:Attachment[];onAttachments?:(files:Attachment[])=>void;
  text:string;onText:(text:string)=>void;onSend:()=>void;canSend:boolean;label?:string;sendLabel?:string;
}) {
  const picker=React.createRef<AttachmentPickerHandle>();
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
      onPaste={onAttachments ? e=>{
        const images=Array.from(e.clipboardData.files).filter(file=>file.type.startsWith('image/'));
        if(!images.length){
          for(const item of Array.from(e.clipboardData.items??[])){
            if(item.kind!=='file'||!item.type.startsWith('image/'))continue;
            const image=item.getAsFile();
            if(image)images.push(image);
          }
        }
        if(!images.length||!picker.current)return;
        e.preventDefault();
        void picker.current.addClipboardImages(images);
      } : undefined}
      onKeyDown={e=>{if(e.key!=='Enter'||e.shiftKey||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;e.preventDefault();if(canSend&&!e.repeat)onSend();}}/>
    {onAttachments&&<AttachmentPicker ref={picker} onBusy={onAttachmentBusy} files={attachments} onFiles={onAttachments}/>}
    <div className="composer-actions">{secondaryAction}<button className="primary" disabled={!canSend} onClick={onSend}>{sendLabel}</button></div>
  </footer>;
}
