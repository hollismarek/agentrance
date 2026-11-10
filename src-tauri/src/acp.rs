use super::*;
use tokio::{io::{AsyncBufReadExt,AsyncWriteExt,BufReader},process::{Command,Child,ChildStdin},sync::{oneshot,Mutex as AsyncMutex}};
use std::{process::Stdio,sync::atomic::{AtomicU64,Ordering},time::Duration};
pub struct Client { input:Arc<AsyncMutex<ChildStdin>>, pending:Arc<AsyncMutex<HashMap<u64,oneshot::Sender<Result<Value,String>>>>>, permissions:Arc<AsyncMutex<HashMap<String,Vec<String>>>>, pub remote:AsyncMutex<String>,pub turn:AsyncMutex<()>, next:AtomicU64, child:Mutex<Child> }
impl Drop for Client { fn drop(&mut self){if let Ok(child)=self.child.get_mut(){let _=child.start_kill();}} }
impl Client {
 pub async fn start(app:tauri::AppHandle,id:String,p:&Provider)->Result<Arc<Self>,String>{
  let mut child=Command::new(&p.executable).args(&p.args).envs(&p.env).current_dir(&p.cwd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true).spawn().map_err(|e|format!("Cannot start {}: {e}",p.name))?;
  let input=Arc::new(AsyncMutex::new(child.stdin.take().ok_or("No stdin")?));
  let out=child.stdout.take().ok_or("No stdout")?;
  let pending=Arc::new(AsyncMutex::new(HashMap::<u64,oneshot::Sender<Result<Value,String>>>::new()));
  let permissions=Arc::new(AsyncMutex::new(HashMap::new()));
  let client=Arc::new(Self{input:input.clone(),pending:pending.clone(),permissions:permissions.clone(),remote:Default::default(),turn:Default::default(),next:AtomicU64::new(1),child:Mutex::new(child)});
  tokio::spawn(async move {
   let mut lines=BufReader::new(out).lines();
   while let Ok(Some(line))=lines.next_line().await {
    let Ok(v)=serde_json::from_str::<Value>(&line) else{continue};
    if let Some(method)=v["method"].as_str(){
     if method=="session/update" {
      let u=&v["params"]["update"];
      match u["sessionUpdate"].as_str(){
       Some("agent_message_chunk")=>{if let Some(t)=u["content"]["text"].as_str(){event(&app,&id,"delta",json!(t));}},
       Some("tool_call")|Some("tool_call_update")=>event(&app,&id,"tool",u.clone()),_=>{}
      }
     }else if method=="session/request_permission" {
      let options=v["params"]["options"].as_array().map(|a|a.iter().filter_map(|x|x["optionId"].as_str().map(String::from)).collect()).unwrap_or_default();
      permissions.lock().await.insert(v["id"].to_string(),options);
      event(&app,&id,"permission",json!({"request":v["id"],"params":v["params"]}));
     }else if v.get("id").is_some(){
      let response=json!({"jsonrpc":"2.0","id":v["id"],"error":{"code":-32601,"message":"Unsupported client method; authentication stays with the CLI"}});
      let _=write(&input,response).await;
     }
    }else if let Some(n)=v["id"].as_u64(){if let Some(tx)=pending.lock().await.remove(&n){let _=tx.send(if v.get("error").is_some(){Err(v["error"].to_string())}else{Ok(v["result"].clone())});}}
   }
   for (_,tx) in pending.lock().await.drain(){let _=tx.send(Err("Provider process exited".into()));}
   event(&app,&id,"disconnected",Value::Null);
  });Ok(client)
 }
 pub async fn send(&self,v:Value)->Result<(),String>{write(&self.input,v).await}
 pub async fn request(&self,method:&str,params:Value)->Result<Value,String>{
  let id=self.next.fetch_add(1,Ordering::Relaxed);let(tx,rx)=oneshot::channel();self.pending.lock().await.insert(id,tx);
  if let Err(e)=self.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params})).await{self.pending.lock().await.remove(&id);return Err(e)}
  let result=tokio::time::timeout(Duration::from_secs(if method=="session/prompt"{1800}else{60}),rx).await;
  self.pending.lock().await.remove(&id);
  result.map_err(|_|"Provider response timed out".to_string())?.map_err(|_|"Provider disconnected".to_string())?
 }
 pub async fn respond_permission(&self,request:Value,option:Option<String>)->Result<(),String>{
  let options=self.permissions.lock().await.remove(&request.to_string()).ok_or("Permission request expired")?;
  if option.as_ref().is_some_and(|o|!options.contains(o)){return Err("Unknown permission option".into())}
  self.send(json!({"jsonrpc":"2.0","id":request,"result":{"outcome":match option{Some(o)=>json!({"outcome":"selected","optionId":o}),None=>json!({"outcome":"cancelled"})}}})).await
 }
}
async fn write(input:&AsyncMutex<ChildStdin>,v:Value)->Result<(),String>{let mut input=input.lock().await;input.write_all(format!("{v}\n").as_bytes()).await.map_err(|e|e.to_string())?;input.flush().await.map_err(|e|e.to_string())}
