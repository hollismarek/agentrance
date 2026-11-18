export type Attachment={id:string;name:string;mimeType:string;data:string;size:number};
export const MAX_FILE=5*1024*1024,MAX_TOTAL=15*1024*1024,MAX_FILES=8;
export async function readAttachment(file:File):Promise<Attachment>{
 if(file.size>MAX_FILE)throw Error(`${file.name}: maximum file size is 5 MB.`);
 const bytes=new Uint8Array(await file.arrayBuffer());
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const image=['image/png','image/jpeg','image/webp','image/gif'].includes(file.type);
 return {id:crypto.randomUUID(),name:file.name,mimeType:image?file.type:file.type||'application/octet-stream',data:btoa(binary),size:bytes.length};
}
