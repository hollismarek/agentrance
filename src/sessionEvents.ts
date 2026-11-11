import type {ActivityEvent} from './activity';
export function mergeEvents(existing:ActivityEvent[],incoming:ActivityEvent[]):ActivityEvent[] {
  const seen=new Set(existing.flatMap(e => e.seq === undefined ? [] : [e.seq]));
  return [...existing,...incoming.filter(e => {
    if(e.seq === undefined) return true;
    if(seen.has(e.seq)) return false;
    seen.add(e.seq);return true;
  })].sort((a,b) => (a.seq ?? Number.MAX_SAFE_INTEGER)-(b.seq ?? Number.MAX_SAFE_INTEGER));
}
