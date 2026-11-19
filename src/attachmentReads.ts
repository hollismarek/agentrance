// Each mounted picker owns a scope; disposing it cancels the effect of late
// browser reads and releases busy reservations exactly once.
export function createReadScope(onBusy:(busy:boolean)=>void){
 let disposed=false;
 const pending=new Set<()=>void>();
 return {
  begin(){
   let finished=false;
   const finish=()=>{if(finished)return;finished=true;pending.delete(finish);onBusy(false)};
   if(disposed)throw Error('Attachment picker is closed');
   pending.add(finish);onBusy(true);
   return {active:()=>!disposed&&!finished,finish};
  },
  dispose(){disposed=true;for(const finish of [...pending])finish()},
 };
}
export function pendingReadCount(current:number,busy:boolean){return Math.max(0,current+(busy?1:-1))}
