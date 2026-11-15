export type Draft={text:string;revision:number};
export type Drafts=Record<string,Draft>;
export function editDraft(drafts:Drafts,id:string,text:string):Drafts {
  return {...drafts,[id]:{text,revision:(drafts[id]?.revision??0)+1}};
}
// Restore a rejected send only if the user has not edited this draft since.
export function restoreDraft(drafts:Drafts,id:string,text:string,clearedRevision:number):Drafts {
  return drafts[id]?.revision===clearedRevision ? editDraft(drafts,id,text) : drafts;
}
