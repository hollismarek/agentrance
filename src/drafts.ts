import type {Attachment} from './attachments';
export type Draft={text:string;revision:number;attachments?:Attachment[]};
export type Drafts=Record<string,Draft>;
export function editDraft(drafts:Drafts,id:string,text:string):Drafts {
  return {...drafts,[id]:{...drafts[id],text,revision:(drafts[id]?.revision??0)+1}};
}
// Restore a rejected send only if the user has not edited this draft since.
export function restoreDraft(drafts:Drafts,id:string,text:string,clearedRevision:number,attachments?:Attachment[]):Drafts {
  return drafts[id]?.revision===clearedRevision ? {...drafts,[id]:{...editDraft(drafts,id,text)[id],...(attachments?{attachments}: {})}} : drafts;
}

export function setAttachments(drafts:Drafts,id:string,attachments:Attachment[]):Drafts{return drafts[id]?{...drafts,[id]:{...drafts[id],attachments,revision:drafts[id].revision+1}}:drafts}
export function clearDraft(drafts:Drafts,id:string):Drafts{return {...drafts,[id]:{text:'',attachments:[],revision:(drafts[id]?.revision??0)+1}}}
