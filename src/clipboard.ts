import {invoke} from '@tauri-apps/api/core';
export async function copyText(text:string):Promise<void>{
  await invoke('copy_text',{text});
}
