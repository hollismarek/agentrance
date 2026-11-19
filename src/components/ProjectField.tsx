import React,{useId,useState} from 'react';
import {open} from '@tauri-apps/plugin-dialog';
export function ProjectField({value,onChange,choices}:{value:string;onChange:(value:string)=>void;choices:string[]}){
 const id=useId();
 const [picking,setPicking]=useState(false),[error,setError]=useState('');
 async function browse(){
  if(picking)return;setPicking(true);setError('');
  try{const path=await open({directory:true,multiple:false,title:'Choose project folder'});if(typeof path==='string')onChange(path)}
  catch(e){setError(`Could not open folder picker: ${e}`)}finally{setPicking(false)}
 }
 return <div className="project-field"><label htmlFor={id+'-path'}>Project folder</label>
  <div className="project-path"><input id={id+'-path'} aria-label="Project folder" list={id} value={value} placeholder="Choose a folder or enter its full path" onChange={e=>onChange(e.target.value)}/>
  <button type="button" onClick={()=>void browse()} disabled={picking}>{picking?'Choosing…':'Browse…'}</button></div>
  <datalist id={id}>{choices.map(path=><option key={path} value={path}/>)}</datalist>
  <small>Use an existing absolute folder path. Provider defaults stay unchanged.</small>
  {error&&<small role="alert">{error}</small>}
 </div>;
}
