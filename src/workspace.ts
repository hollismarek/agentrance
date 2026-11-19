export type LayoutMode='single'|'columns'|'rows'|'three'|'grid';
export type Workspace={groups:string[][];selected:(string|null)[];focus:number;mode:LayoutMode};
export const initialWorkspace:Workspace={groups:[[],[],[],[]],selected:[null,null,null,null],focus:0,mode:'single'};
export const paneCount=(mode:LayoutMode)=>mode==='single'?1:mode==='three'?3:mode==='grid'?4:2;
export const splitMode=(count:number):LayoutMode=>count<=2?'columns':count===3?'three':'grid';
export type WorkspaceAction={type:'restore';workspace:Workspace}|{type:'open';ids:string[]}|{type:'select';pane:number;id:string}|{type:'focus';pane:number}|{type:'mode';mode:LayoutMode}|{type:'move';id:string;pane:number}|{type:'retain';ids:string[]};
export function workspaceReducer(s:Workspace,a:WorkspaceAction):Workspace {
  const n:Workspace={...s,groups:s.groups.map(group=>[...group]),selected:[...s.selected]};
  const valid=(pane:number)=>Number.isInteger(pane)&&pane>=0&&pane<4;
  const remove=(id:string)=>{for(let p=0;p<4;p++){n.groups[p]=n.groups[p].filter(x=>x!==id);if(n.selected[p]===id)n.selected[p]=n.groups[p].at(-1)??null;}};
  const add=(id:string,p:number)=>{remove(id);n.groups[p].push(id);n.selected[p]=id;};
  switch(a.type){
    case 'restore':return a.workspace;
    case 'open':
      if(a.ids.length>1&&n.mode==='single')n.mode=splitMode(Math.min(4,a.ids.length));
      a.ids.forEach((id,i)=>{const existing=n.groups.findIndex(g=>g.includes(id));const p=a.ids.length>1?i%paneCount(n.mode):existing>=0?existing:n.focus;add(id,p);n.focus=p;});break;
    case 'select':if(!valid(a.pane)||a.pane>=paneCount(n.mode)||!n.groups[a.pane].includes(a.id))return s;n.selected[a.pane]=a.id;n.focus=a.pane;break;
    case 'focus':if(!valid(a.pane)||a.pane>=paneCount(n.mode))return s;n.focus=a.pane;break;
    case 'move':if(!valid(a.pane)||!n.groups.some(group=>group.includes(a.id)))return s;add(a.id,a.pane);n.focus=a.pane;if(a.pane>=paneCount(n.mode))n.mode=splitMode(a.pane+1);break;
    case 'mode':{
      const count=paneCount(a.mode),active=n.selected[n.focus];
      n.mode=a.mode;
      // Merge hidden panes into the last visible one, retaining every session.
      for(let p=count;p<4;p++){n.groups[count-1].push(...n.groups[p]);n.groups[p]=[];n.selected[p]=null;}
      if(n.focus>=count){n.focus=count-1;n.selected[n.focus]=active??n.groups[n.focus].at(-1)??null;}
      for(let p=0;p<count;p++)if(!n.selected[p])n.selected[p]=n.groups[p][0]??null;
      break;
    }
    case 'retain':for(const id of n.groups.flat())if(!a.ids.includes(id))remove(id);break;
  }
  return JSON.stringify(n)===JSON.stringify(s)?s:n;
}
