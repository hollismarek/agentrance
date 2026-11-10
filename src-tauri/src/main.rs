mod acp;
use std::{collections::HashMap, sync::{Arc,Mutex}};
use serde::{Serialize,Deserialize};
use serde_json::{json,Value};
use tauri::{Manager,Emitter};
use rusqlite::{Connection,params};
#[derive(Clone,Serialize,Deserialize)]
struct Provider { id:String, name:String, executable:String, args:Vec<String>, env:HashMap<String,String>, cwd:String }
struct AppState { clients:tokio::sync::Mutex<HashMap<String,Arc<acp::Client>>>, db:Mutex<Connection> }
fn event(app:&tauri::AppHandle,id:&str,kind:&str,data:Value) {
 let payload=json!({"session":id,"kind":kind,"data":data});
 if ["user","delta","error","tool"].contains(&kind) {
  let state=app.state::<AppState>();
  if let Ok(db)=state.db.lock() { let _=db.execute("INSERT INTO events(session,kind,data) VALUES(?1,?2,?3)",params![id,kind,data.to_string()]); };
 }
 let _=app.emit("agent-event",payload);
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
 client.respond_permission(request,option).await
}
#[tauri::command]
async fn cancel(app:tauri::AppHandle,id:String)->Result<(),String>{
 let client=app.state::<AppState>().clients.lock().await.get(&id).cloned().ok_or("Session closed")?;
 let remote=client.remote.lock().await.clone();
 client.send(json!({"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":remote}})).await
}
#[tauri::command]
async fn close_session(app:tauri::AppHandle,id:String){
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
 let mut q=db.prepare("SELECT kind,data FROM events WHERE session=?1 ORDER BY rowid").map_err(|e|e.to_string())?;
 let rows=q.query_map([id],|r|{let d:String=r.get(1)?;Ok(json!({"kind":r.get::<_,String>(0)?,"data":serde_json::from_str::<Value>(&d).unwrap_or(Value::Null)}))}).map_err(|e|e.to_string())?;
 Ok(Value::Array(rows.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?))
}
fn main(){tauri::Builder::default().setup(|app|{
 let dir=app.path().app_data_dir()?;std::fs::create_dir_all(&dir)?;
 let db=Connection::open(dir.join("history.sqlite3"))?;
 db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,provider TEXT NOT NULL,cwd TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(session TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);")?;
 app.manage(AppState{clients:Default::default(),db:Mutex::new(db)});Ok(())
}).invoke_handler(tauri::generate_handler![new_session,prompt,permission,cancel,history,messages,close_session]).run(tauri::generate_context!()).expect("Agent Desk failed");}
