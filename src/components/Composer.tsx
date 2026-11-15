import React from 'react';
export function Composer({text,onText,onSend,canSend,label='Message',sendLabel='Send'}: {
  text:string;onText:(text:string)=>void;onSend:()=>void;canSend:boolean;label?:string;sendLabel?:string;
}) {
  return <footer>
    <textarea aria-label={label} title="Enter to send · Shift+Enter for a new line" placeholder="Ask a question about your project…" value={text} onChange={e=>onText(e.target.value)}
      onKeyDown={e=>{if(e.key!=='Enter'||e.shiftKey||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;e.preventDefault();if(canSend&&!e.repeat)onSend();}}/>
    <div className="composer-actions"><button className="primary" disabled={!canSend} onClick={onSend}>{sendLabel}</button></div>
  </footer>;
}
