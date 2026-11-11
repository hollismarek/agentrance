import type {ActivityEvent} from './activity';
export type ChatTurn={key:string;question:string|null;answer:string;errors:string[];complete:boolean};
export function conversationTurns(events:ActivityEvent[],busy=false):ChatTurn[]{
  const turns:ChatTurn[]=[];let current:ChatTurn|undefined;
  const finish=()=>{if(current)current.complete=true};
  const begin=(key:string,question:string|null)=>{current={key,question,answer:'',errors:[],complete:false};turns.push(current);return current};
  for(const [index,e] of events.entries()){
    const key=String(e.seq??`event-${index}`);
    if(e.kind==='user'&&typeof e.data==='string'){finish();begin(key,e.data)}
    else if(e.kind==='delta'&&typeof e.data==='string'){
      if(!current||current.complete)begin(key,null);
      current!.answer+=e.data;
    }else if(e.kind==='error'){
      if(!current||current.complete)begin(key,null);
      current!.errors.push(typeof e.data==='string'?e.data:JSON.stringify(e.data));
    }else if(['done','disconnected','session_closed','connection_started'].includes(e.kind))finish();
  }
  if(!busy)finish(); // Legacy saved logs may not contain a turn-end event.
  return turns;
}
export function questionAndAnswer(turn:ChatTurn,provider:string):string {
  return `You\n${turn.question??''}\n\n${provider}\n${turn.answer}`;
}
