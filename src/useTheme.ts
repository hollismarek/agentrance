import {useEffect,useState} from 'react';
import {parseTheme,watchTheme,type ThemePreference} from './theme';
export function useTheme(channel:string) {
  const [preference,setPreference]=useState<ThemePreference>('system');
  useEffect(()=>{
    if(!channel)return;
    try{setPreference(parseTheme(localStorage.getItem(`agentrance.theme.${channel}`)))}catch{setPreference('system')}
  },[channel]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    return watchTheme(preference,media,value=>{document.documentElement.dataset.theme=value});
  },[preference]);
  function choose(value:ThemePreference){
    setPreference(value);
    if(channel)try{localStorage.setItem(`agentrance.theme.${channel}`,value)}catch{/* Preference still works for this run. */}
  }
  return {preference,choose};
}
