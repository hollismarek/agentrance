import React,{useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createReadScope} from '../attachmentReads';
import {readAttachment,isAttachableImage,MAX_FILES,MAX_TOTAL,type Attachment} from '../attachments';
export type AttachmentPickerHandle = { addClipboardImages: (images: File[]) => Promise<void> };
export function AttachmentPicker({ref,files,onFiles,onBusy}:{ref?:React.Ref<AttachmentPickerHandle>;onBusy?:(busy:boolean)=>void;files:Attachment[];onFiles:(files:Attachment[])=>void}){
 const scope=useRef<ReturnType<typeof createReadScope>|null>(null);
 useEffect(()=>{const current=createReadScope(onBusy??(()=>{}));scope.current=current;return()=>current.dispose()},[]);
 const latest=useRef(files);latest.current=files;
 const input=useRef<HTMLInputElement>(null);const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const reading=useRef(false);
 async function addFiles(selected:File[],fromClipboard=false){
  if(!selected.length)return;
  if(reading.current){
   setError('Wait for the current attachment to load, then try again.');
   return;
  }
  setError('');
  if(fromClipboard&&selected.some(file=>!isAttachableImage(file.type))){
   setError('Pasted images must be PNG, JPEG, WebP, or GIF.');
   return;
  }
  const total=[...files,...selected].reduce((size,file)=>size+file.size,0);
  if(files.length+selected.length>MAX_FILES||total>MAX_TOTAL){
   setError('Attach up to 8 files, totaling at most 15 MB.');
   return;
  }
  const ticket=scope.current?.begin();
  if(!ticket)return;
  reading.current=true;
  setBusy(true);
  try{
   const added=await Promise.all(selected.map(file=>readAttachment(file)));
   if(!ticket.active())return;
   if(latest.current!==files){
    setError('Attachments changed while loading. Please select the files again.');
    return;
   }
   onFiles([...files,...added]);
  }catch(err){
   if(ticket.active())setError(String(err));
  }finally{
   reading.current=false;
   if(ticket.active())setBusy(false);
   ticket.finish();
  }
 }
 useImperativeHandle(ref,()=>({addClipboardImages:images=>addFiles(images,true)}));
 return <div className="attachment-picker">
  <div className="attachment-controls">
   <button type="button" disabled={busy} aria-label="Attach files" title={busy?'Loading attachments…':'Attach images or files'} onClick={()=>input.current?.click()}>
    {busy?'…':'＋'}
   </button>
   <input ref={input} type="file" multiple hidden onChange={e=>{
    const selected=Array.from(e.target.files??[]);
    e.target.value='';
    void addFiles(selected);
   }}/>
  </div>
  {files.length>0&&<div className="attachment-strip" aria-label="Prompt attachments">
   {files.map(file=><div className="attachment" key={file.id}>
    {file.mimeType.startsWith('image/')?<img src={`data:${file.mimeType};base64,${file.data}`} alt={file.name}/>:<span aria-hidden="true">▤</span>}
    <span title={file.name}>{file.name}</span>
    <button type="button" aria-label={`Remove ${file.name}`} onClick={()=>onFiles(files.filter(f=>f.id!==file.id))}>×</button>
   </div>)}
  </div>}
  {error&&<small className="attachment-error" role="alert">{error}</small>}
 </div>;
}
