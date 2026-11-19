import {useLayoutEffect,useRef} from 'react';
export type TranscriptPosition={top:number;follow:boolean};
export type TranscriptPositions=Map<string,TranscriptPosition>;

export function useTranscriptScroll(id:string,positions:TranscriptPositions){
 const body=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 function restore(fresh=false){
  const element=body.current;if(!element)return;
  const saved=positions.get(id)??{top:0,follow:true};
  if(!fresh&&!saved.follow)return;
  element.scrollTop=saved.follow?element.scrollHeight:saved.top;
  positions.set(id,{...saved,top:element.scrollTop});
 }
 // Restore before painting after a tab switch or streamed content update.
 useLayoutEffect(()=>restore());
 useLayoutEffect(()=>{
  const element=body.current;if(!element)return;
  restore(true);
  const observer=new ResizeObserver(()=>restore());
  observer.observe(element);if(content.current)observer.observe(content.current);
  return ()=>{
   const saved=positions.get(id);
   if(saved)positions.set(id,{...saved,top:element.scrollTop});
   observer.disconnect();
  };
 },[id,positions]);
 return {body,content,onScroll:()=>{
  const element=body.current;if(element)positions.set(id,{top:element.scrollTop,follow:element.scrollHeight-element.clientHeight-element.scrollTop<=8});
 }};
}
