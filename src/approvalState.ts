import {reduceActivity,type ActivityEvent} from './activity';
export function pendingApprovals(events:ActivityEvent[],live:boolean){
 return reduceActivity(events,live).flatMap(op=>op.approvals.filter(a=>!a.expired&&!a.decision));
}
