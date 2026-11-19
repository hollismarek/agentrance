export function startupErrors(results:PromiseSettledResult<string>[],providers:{name:string}[]):string[]{
 return results.flatMap((result,i)=>result.status==='rejected'?[`${providers[i].name}: ${result.reason}`]:[]);
}
export function reportSendFailure(errors:string[],provider:string|undefined,error:unknown,report:(message:string)=>void){
 errors.push(`${provider?`${provider}: `:''}${error}`);report(errors.join('\n'));
}
