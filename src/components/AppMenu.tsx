import React,{useEffect,useRef} from 'react';
import type {ThemePreference} from '../theme';
export function AppMenu({onSettings,onHelp,theme='system',onTheme}:{onSettings:()=>void;onHelp:()=>void;theme?:ThemePreference;onTheme?:(value:ThemePreference)=>void}){
  const menu=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    function outside(e:PointerEvent){if(!menu.current?.contains(e.target as Node)&&menu.current)menu.current.open=false}
    function escape(e:KeyboardEvent){if(e.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
  },[]);
  function choose(action:()=>void){if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}action()}
  return <details className="app-menu" ref={menu}><summary>Menu</summary><div className="app-menu-items">
    <label className="theme-choice">Appearance<select aria-label="Appearance" value={theme} onChange={e=>onTheme?.(e.target.value as ThemePreference)}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <button onClick={()=>choose(onSettings)}>Provider settings</button>
    <button onClick={()=>choose(onHelp)}>Help &amp; About</button>
  </div></details>;
}
