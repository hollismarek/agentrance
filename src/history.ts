import type {SavedSession} from './types';
export function chatTitle(chat: Pick<SavedSession,'title'>):string {
  return typeof chat.title==='string' && chat.title.trim() ? chat.title : 'New conversation';
}
export function historyDate(at?:number|null):string {
  if(at==null || !Number.isFinite(at))return '';
  const date=new Date(at);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
}
