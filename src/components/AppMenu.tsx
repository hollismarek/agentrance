import React,{useEffect,useRef} from 'react';
export function AppMenu({onSettings,onHelp,onBackup,onProviderSession,settingsReady=true}:{settingsReady?:boolean;onSettings:()=>void;onHelp:()=>void;onBackup?:()=>void;onProviderSession?:()=>void}){
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    function outside(e:PointerEvent){if(!menu.current?.contains(e.target as Node)&&menu.current)menu.current.open=false}
    function escape(e:KeyboardEvent){if(e.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[]);
  function choose(action:()=>void){if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}action()}
  return <details className="app-menu" ref={menu}><summary>Menu</summary><div className="app-menu-items">
    <button disabled={!settingsReady} onClick={()=>choose(onSettings)}>{settingsReady?'Settings':'Settings (loading…)'}</button>
    {onProviderSession&&<button onClick={()=>choose(onProviderSession)}>Open provider session…</button>}
    {onBackup&&<button onClick={()=>choose(onBackup)}>Backup &amp; Restore</button>}
    <button onClick={()=>choose(onHelp)}>Help &amp; About</button>
  </div></details>;
}
