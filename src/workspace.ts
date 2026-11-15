export type LayoutMode='single'|'columns'|'rows';
export type Workspace={groups:[string[],string[]];selected:[string|null,string|null];focus:0|1;mode:LayoutMode};
export const initialWorkspace:Workspace={groups:[[],[]],selected:[null,null],focus:0,mode:'single'};
export type WorkspaceAction={type:'open';ids:string[]}|{type:'select';pane:0|1;id:string}|{type:'focus';pane:0|1}|{type:'mode';mode:LayoutMode}|{type:'move';id:string;pane:0|1}|{type:'retain';ids:string[]};
export function workspaceReducer(s:Workspace,a:WorkspaceAction):Workspace {
  const n:Workspace={...s,groups:[[...s.groups[0]],[...s.groups[1]]],selected:[...s.selected]};
  const remove=(id:string)=>{for(const p of [0,1] as const){n.groups[p]=n.groups[p].filter(x=>x!==id);if(n.selected[p]===id)n.selected[p]=n.groups[p].at(-1)??null;}};
  const add=(id:string,p:0|1)=>{remove(id);n.groups[p].push(id);n.selected[p]=id;};
  switch(a.type){
    case 'open':a.ids.forEach((id,i)=>{const existing=n.groups.findIndex(g=>g.includes(id));const p:0|1=a.ids.length>1?(i%2===0?0:1):existing>=0?existing as 0|1:n.focus;add(id,p);n.focus=p;});if(a.ids.length>1)n.mode=s.mode==='single'?'columns':s.mode;break;
    case 'select':if(!n.groups[a.pane].includes(a.id))return s;n.selected[a.pane]=a.id;n.focus=a.pane;break;
    case 'focus':n.focus=a.pane;break;
    case 'move':add(a.id,a.pane);n.focus=a.pane;if(n.mode==='single')n.mode='columns';break;
    case 'mode':n.mode=a.mode;if(a.mode==='single'){const active=n.selected[n.focus];n.groups[0]=[...n.groups[0],...n.groups[1]];n.groups[1]=[];n.selected=[active??n.groups[0][0]??null,null];n.focus=0;}break;
    case 'retain':for(const id of n.groups.flat())if(!a.ids.includes(id))remove(id);break;
  }
  return JSON.stringify(n)===JSON.stringify(s)?s:n;
}
