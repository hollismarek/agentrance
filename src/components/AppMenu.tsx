import React,{useEffect,useRef} from 'react';
export function AppMenu({onSettings,onHelp}:{onSettings:()=>void;onHelp:()=>void}){
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    function outside(e:PointerEvent){if(!menu.current?.contains(e.target as Node)&&menu.current)menu.current.open=false}
    function escape(e:KeyboardEvent){if(e.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[]);
  function choose(action:()=>void){if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}action()}
  return <details className="app-menu" ref={menu}><summary>Menu</summary><div className="app-menu-items">
    <button onClick={()=>choose(onSettings)}>Settings</button>
    <button onClick={()=>choose(onHelp)}>Help &amp; About</button>
  </div></details>;
}
