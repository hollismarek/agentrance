import React from 'react';
export function Composer({text,onText,onSend,onCompare,canSend,canCompare}: {
  text: string; onText: (text:string) => void; onSend: () => void; onCompare: () => void; canSend: boolean; canCompare: boolean;
}) {
  return <footer>
    <textarea aria-label="Message" placeholder="Ask a question about your project…" value={text} onChange={e => onText(e.target.value)}
      onKeyDown={e => {
        if(e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
        e.preventDefault();
        if(canSend && !e.repeat) onSend();
      }}/>
    <div><small>Enter to send · Shift+Enter for a new line · compare creates fresh sessions</small>
      <button disabled={!canCompare} onClick={onCompare}>Compare all providers</button>
      <button className="primary" disabled={!canSend} onClick={onSend}>Send</button>
    </div>
  </footer>;
}
