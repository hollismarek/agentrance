use super::*;
use std::{
    process::Stdio,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex as AsyncMutex},
};
type EventSink = Arc<dyn Fn(&str, Value) + Send + Sync>;
pub struct Client {
    replaying: Arc<AtomicBool>,
    stopped: Arc<AtomicBool>,
    connected: Arc<AtomicBool>,
    input: Arc<AsyncMutex<ChildStdin>>,
    pending: Arc<AsyncMutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>>,
    permissions: Arc<AsyncMutex<HashMap<String, Value>>>,
    pub remote: AsyncMutex<String>,
    pub turn: AsyncMutex<()>,
    next: AtomicU64,
    child: Mutex<Child>,
}
impl Drop for Client {
    fn drop(&mut self) {
        self.shutdown();
    }
}
impl Client {
    pub async fn start(
        app: tauri::AppHandle,
        id: String,
        p: &Provider,
    ) -> Result<Arc<Self>, String> {
        Self::start_transport(p, Arc::new(move |kind, data| event(&app, &id, kind, data))).await
    }
    async fn start_transport(p: &Provider, emit: EventSink) -> Result<Arc<Self>, String> {
        let mut child = Command::new(&p.executable)
            .args(&p.args)
            .envs(&p.env)
            .current_dir(&p.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Cannot start {}: {e}", p.name))?;
        let input = Arc::new(AsyncMutex::new(child.stdin.take().ok_or("No stdin")?));
        let out = child.stdout.take().ok_or("No stdout")?;
        let pending = Arc::new(AsyncMutex::new(HashMap::<
            u64,
            oneshot::Sender<Result<Value, String>>,
        >::new()));
        let permissions = Arc::new(AsyncMutex::new(HashMap::new()));
        let replaying = Arc::new(AtomicBool::new(false));
        let stopped = Arc::new(AtomicBool::new(false));
        let connected = Arc::new(AtomicBool::new(true));
        let client = Arc::new(Self {
            replaying: replaying.clone(),
            stopped: stopped.clone(),
            connected: connected.clone(),
            input: input.clone(),
            pending: pending.clone(),
            permissions: permissions.clone(),
            remote: Default::default(),
            turn: Default::default(),
            next: AtomicU64::new(1),
            child: Mutex::new(child),
        });
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(v) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if stopped.load(Ordering::SeqCst) {
                    continue;
                }
                if let Some(method) = v["method"].as_str() {
                    if method == "session/update" {
                        // session/load replays provider history. The app already
                        // has its durable transcript and activity; do not duplicate it.
                        if replaying.load(Ordering::SeqCst) {
                            continue;
                        }
                        let u = &v["params"]["update"];
                        match u["sessionUpdate"].as_str() {
                            Some("agent_message_chunk") => {
                                if let Some(t) = u["content"]["text"].as_str() {
                                    emit("delta", json!(t));
                                }
                            }
                            Some("tool_call") | Some("tool_call_update") => emit("tool", u.clone()),
                            _ => {}
                        }
                    } else if method == "session/request_permission" {
                        permissions
                            .lock()
                            .await
                            .insert(v["id"].to_string(), v["params"].clone());
                        emit(
                            "permission",
                            json!({"request":v["id"],"params":v["params"]}),
                        );
                    } else if v.get("id").is_some() {
                        let response = json!({"jsonrpc":"2.0","id":v["id"],"error":{"code":-32601,"message":"Unsupported client method; authentication stays with the CLI"}});
                        let _ = write(&input, response).await;
                    }
                } else if let Some(n) = v["id"].as_u64() {
                    if let Some(tx) = pending.lock().await.remove(&n) {
                        let _ = tx.send(if v.get("error").is_some() {
                            Err(v["error"].to_string())
                        } else {
                            Ok(v["result"].clone())
                        });
                    }
                }
            }
            for (_, tx) in pending.lock().await.drain() {
                let _ = tx.send(Err("Provider process exited".into()));
            }
            connected.store(false, Ordering::SeqCst);
            if !stopped.load(Ordering::SeqCst) {
                emit("disconnected", Value::Null);
            }
        });
        Ok(client)
    }
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst) && !self.stopped.load(Ordering::SeqCst)
    }
    pub fn shutdown(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        self.connected.store(false, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            let _ = child.start_kill();
        }
    }
    pub async fn restore(&self, init: &Value, remote: &str, cwd: &str) -> Result<(), String> {
        let method = crate::resume::method(init)?;
        self.replaying
            .store(method == "session/load", Ordering::SeqCst);
        let result = self
            .request(
                method,
                json!({"sessionId":remote,"cwd":cwd,"mcpServers":[]}),
            )
            .await;
        self.replaying.store(false, Ordering::SeqCst);
        result?;
        *self.remote.lock().await = remote.to_string();
        Ok(())
    }
    pub async fn send(&self, v: Value) -> Result<(), String> {
        write(&self.input, v).await
    }
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        if let Err(e) = self
            .send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(e);
        }
        let result = tokio::time::timeout(
            Duration::from_secs(if method == "session/prompt" { 1800 } else { 60 }),
            rx,
        )
        .await;
        self.pending.lock().await.remove(&id);
        result
            .map_err(|_| "Provider response timed out".to_string())?
            .map_err(|_| "Provider disconnected".to_string())?
    }
    pub async fn respond_permission(
        &self,
        request: Value,
        option: Option<String>,
    ) -> Result<Value, String> {
        let mut permissions = self.permissions.lock().await;
        let params = permissions
            .get(&request.to_string())
            .ok_or("Permission request expired")?;
        let selected = match &option {
            Some(id) => Some(
                params["options"]
                    .as_array()
                    .and_then(|options| {
                        options
                            .iter()
                            .find(|o| o["optionId"].as_str() == Some(id.as_str()))
                    })
                    .ok_or("Unknown permission option")?,
            ),
            None => None,
        };
        let decision = json!({"request":request,"option":option,"optionKind":selected.map(|o|o["kind"].clone()),"optionName":selected.map(|o|o["name"].clone())});
        self.send(json!({"jsonrpc":"2.0","id":request,"result":{"outcome":match &option{Some(o)=>json!({"outcome":"selected","optionId":o}),None=>json!({"outcome":"cancelled"})}}})).await?;
        permissions.remove(&request.to_string());
        Ok(decision)
    }
}
async fn write(input: &AsyncMutex<ChildStdin>, v: Value) -> Result<(), String> {
    let mut input = input.lock().await;
    input
        .write_all(format!("{v}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    input.flush().await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn reconnects_exact_sessions_without_duplicate_replay_or_cross_talk() {
        tokio::time::timeout(Duration::from_secs(10), async {
            let script=r#"
import json,sys
remote=sys.argv[1]
mode=sys.argv[2]
def send(v): print(json.dumps(v),flush=True)
for line in sys.stdin:
 m=json.loads(line); method=m.get('method'); params=m.get('params',{})
 if method=='initialize':
  caps={'loadSession':True}
  if mode=='session/resume': caps['sessionCapabilities']={'resume':{}}
  result={'protocolVersion':1,'agentCapabilities':caps}
 elif method in ('session/load','session/resume'):
  assert method==mode and params['sessionId']==remote
  assert params['cwd']==sys.argv[3] and params['mcpServers']==[]
  if method=='session/load':
   send({'jsonrpc':'2.0','method':'session/update','params':{'sessionId':remote,'update':{'sessionUpdate':'agent_message_chunk','content':{'type':'text','text':'OLD REPLAY'}}}})
   send({'jsonrpc':'2.0','method':'session/update','params':{'sessionId':remote,'update':{'sessionUpdate':'tool_call','toolCallId':'old','status':'completed'}}})
  result={}
 elif method=='session/prompt':
  assert params['sessionId']==remote
  send({'jsonrpc':'2.0','method':'session/update','params':{'sessionId':remote,'update':{'sessionUpdate':'agent_message_chunk','content':{'type':'text','text':'continued '+remote}}}})
  result={'stopReason':'end_turn'}
 else: raise AssertionError('Unexpected method: '+str(method))
 send({'jsonrpc':'2.0','id':m['id'],'result':result})
"#;
            let mut clients=Vec::new();
            for (remote,method) in [("saved-a","session/load"),("saved-b","session/resume")] {
                let cwd=std::env::temp_dir().to_string_lossy().into_owned();
                let p=Provider{id:remote.into(),name:"Fake ACP".into(),executable:"python3".into(),
                    args:vec!["-u".into(),"-c".into(),script.into(),remote.into(),method.into(),cwd.clone()],env:HashMap::new(),cwd:cwd.clone()};
                let events=Arc::new(Mutex::new(Vec::<(String,Value)>::new()));
                let sink=events.clone();
                let client=Client::start_transport(&p,Arc::new(move |kind,data|sink.lock().unwrap().push((kind.into(),data)))).await.unwrap();
                let init=client.request("initialize",json!({"protocolVersion":1})).await.unwrap();
                client.restore(&init,remote,&cwd).await.unwrap();
                assert_eq!(*client.remote.lock().await,remote);
                assert!(events.lock().unwrap().is_empty(),"load replay must not duplicate local history");
                clients.push((client,events,remote));
            }
            for (client,events,remote) in &clients {
                client.request("session/prompt",json!({"sessionId":client.remote.lock().await.clone(),"prompt":[]})).await.unwrap();
                assert_eq!(*events.lock().unwrap(),vec![("delta".into(),json!(format!("continued {remote}")))]);
                client.shutdown();assert!(!client.is_connected());
            }
        }).await.expect("mock ACP reconnect timed out");
    }
}
