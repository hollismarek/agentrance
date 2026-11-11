import React,{useEffect,useRef,useState} from 'react';
import {copyText} from '../clipboard';
export function CopyButton({text,label,disabled=false}:{text:string;label:string;disabled?:boolean}){
  const [status,setStatus]=useState<'idle'|'copying'|'copied'|'error'>('idle');
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current)}},[]);
  async function copy(){
    if(disabled||status==='copying')return;
    clearTimeout(timer.current);setStatus('copying');
    try{await copyText(text);if(mounted.current){setStatus('copied');timer.current=setTimeout(()=>setStatus('idle'),1800)}}
    catch{if(mounted.current)setStatus('error')}
  }
  return <span className="copy-action">
    <button type="button" className="copy-button" disabled={disabled||status==='copying'} title={disabled?'Available when the response finishes':label} aria-label={label} onClick={()=>void copy()}>
      {status==='copied'?'Copied':status==='copying'?'Copying…':status==='error'?'Retry copy':label}
    </button>
    <span className="sr-only" role="status">{status==='copied'?`${label}: copied to clipboard`:''}</span>
    {status==='error'&&<span className="copy-error" role="alert">Could not copy. Try again.</span>}
  </span>;
}
