import React,{useId} from 'react';
export function ProjectField({value,onChange,choices}:{value:string;onChange:(value:string)=>void;choices:string[]}){
 const id=useId();
 return <label className="project-field">Project folder
  <input aria-label="Project folder" list={id} value={value} placeholder="Choose a recent project or enter its full path" onChange={e=>onChange(e.target.value)}/>
  <datalist id={id}>{choices.map(path=><option key={path} value={path}/>)}</datalist>
  <small>Use an existing absolute folder path. Provider defaults stay unchanged.</small>
 </label>;
}
