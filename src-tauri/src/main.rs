mod acp;
mod storage;
use std::{collections::HashMap, sync::{Arc,Mutex}};
use serde::{Serialize,Deserialize};
use serde_json::{json,Value};
use tauri::{Manager,Emitter};
use rusqlite::{Connection,params};
#[derive(Clone,Serialize,Deserialize)]
struct Provider { id:String, name:String, executable:String, args:Vec<String>, env:HashMap<String,String>, cwd:String }
struct AppState { clients:tokio::sync::Mutex<HashMap<String,Arc<acp::Client>>>, db:Mutex<Connection> }
fn event(app:&tauri::AppHandle,id:&str,kind:&str,data:Value) {
 let at=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
 let state=app.state::<AppState>();
 let mut payload=json!({"session":id,"kind":kind,"data":data,"at":at});
 // Persist and publish under the same lock to preserve replay/live ordering.
 if let Ok(db)=state.db.lock() {
  match storage::append(&db,id,kind,&data,at) {
   Ok(seq)=>payload["seq"]=json!(seq),
   Err(e)=>{let _=app.emit("history-error",format!("Unable to save conversation activity: {e}"));}
  }
  let _=app.emit("agent-event",payload);
 };

}
#[tauri::command]
async fn new_session(app:tauri::AppHandle,provider:Provider)->Result<String,String>{
 let id=uuid::Uuid::new_v4().to_string();
 let client=acp::Client::start(app.clone(),id.clone(),&provider).await?;
 let init=client.request("initialize",json!({"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"agent-desk","version":"0.1.0"}})).await?;
 if init["protocolVersion"] != 1 {return Err("Provider did not negotiate ACP v1".into())}
 let session=client.request("session/new",json!({"cwd":provider.cwd,"mcpServers":[]})).await?;
 let remote=session["sessionId"].as_str().ok_or("Missing sessionId")?.to_string();
 *client.remote.lock().await=remote;
 let state=app.state::<AppState>();
 state.db.lock().map_err(|e|e.to_string())?.execute("INSERT INTO sessions(id,provider,cwd) VALUES(?1,?2,?3)",params![id,provider.name,provider.cwd]).map_err(|e|e.to_string())?;
 state.clients.lock().await.insert(id.clone(),client);
 event(&app,&id,"identity",init);
 Ok(id)
}
#[tauri::command]
async fn prompt(app:tauri::AppHandle,id:String,text:String)->Result<(),String>{
 let client=app.state::<AppState>().clients.lock().await.get(&id).cloned().ok_or("Session is historical; start a fresh session")?;
 let _busy=client.turn.try_lock().map_err(|_|"A response is already running")?;
 event(&app,&id,"user",json!(text));
 let remote=client.remote.lock().await.clone();
 let result=client.request("session/prompt",json!({"sessionId":remote,"prompt":[{"type":"text","text":text}]})).await;
 if let Err(e)=&result {event(&app,&id,"error",json!(e));}
 event(&app,&id,"done",json!(null)); result.map(|_|())
}
#[tauri::command]
async fn permission(app:tauri::AppHandle,id:String,request:Value,option:Option<String>)->Result<(),String>{
 let client=app.state::<AppState>().clients.lock().await.get(&id).cloned().ok_or("Session closed")?;
 let decision=client.respond_permission(request,option).await?;
 event(&app,&id,"permission_resolved",decision);
 Ok(())
}
#[tauri::command]
async fn cancel(app:tauri::AppHandle,id:String)->Result<(),String>{
 let client=app.state::<AppState>().clients.lock().await.get(&id).cloned().ok_or("Session closed")?;
 let remote=client.remote.lock().await.clone();
 client.send(json!({"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":remote}})).await
}
#[tauri::command]
async fn close_session(app:tauri::AppHandle,id:String){
 event(&app,&id,"session_closed",Value::Null);
 app.state::<AppState>().clients.lock().await.remove(&id);
}
#[tauri::command]
fn history(app:tauri::AppHandle)->Result<Value,String>{
 let state=app.state::<AppState>();let db=state.db.lock().map_err(|e|e.to_string())?;
 let mut q=db.prepare("SELECT id,provider,cwd FROM sessions ORDER BY rowid DESC").map_err(|e|e.to_string())?;
 let rows=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"provider":r.get::<_,String>(1)?,"cwd":r.get::<_,String>(2)?}))).map_err(|e|e.to_string())?;
 Ok(Value::Array(rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?))
}
#[tauri::command]
fn messages(app:tauri::AppHandle,id:String)->Result<Value,String>{
 let state=app.state::<AppState>();let db=state.db.lock().map_err(|e|e.to_string())?;
 storage::messages(&db,&id).map_err(|e|e.to_string())
}
fn main(){tauri::Builder::default().setup(|app|{
 let dir=app.path().app_data_dir()?;std::fs::create_dir_all(&dir)?;
 let db=Connection::open(dir.join("history.sqlite3"))?;
 storage::initialize(&db)?;
 app.manage(AppState{clients:Default::default(),db:Mutex::new(db)});Ok(())
}).invoke_handler(tauri::generate_handler![new_session,prompt,permission,cancel,history,messages,close_session]).run(tauri::generate_context!()).expect("Agent Desk failed");}
