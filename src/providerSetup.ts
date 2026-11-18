// Runtime launchers may be discovered before their IDs have been saved. Never
// create a conversation until the configuration can be matched after restart.
export function withSavedProviders(ready:boolean,needsSetup:boolean,openSettings:()=>void,start:()=>void):boolean {
  if(!ready)return false;
  if(needsSetup){openSettings();return false}
  start();return true;
}
