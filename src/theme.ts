export type ThemePreference='system'|'light'|'dark';
export function parseTheme(value:unknown):ThemePreference {
  return value==='light'||value==='dark'?value:'system';
}
export function resolveTheme(preference:ThemePreference,systemDark:boolean):'light'|'dark' {
  return preference==='system'?(systemDark?'dark':'light'):preference;
}

export function watchTheme(preference:ThemePreference,media:Pick<MediaQueryList,'matches'|'addEventListener'|'removeEventListener'>,apply:(theme:'light'|'dark')=>void) {
  const update=()=>apply(resolveTheme(preference,media.matches));
  update();media.addEventListener('change',update);
  return ()=>media.removeEventListener('change',update);
}
