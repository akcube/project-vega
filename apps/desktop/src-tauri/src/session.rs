use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

use crate::domain::{Provider, Task};
use crate::events::{PlanEntry, SessionUpdate, ToolContent};

#[derive(Debug, Clone)]
pub struct SessionInfo {
    pub provider_session_id: String,
    pub provider_log_path: Option<String>,
}

enum AgentCommand {
    Prompt {
        text: String,
        updates_tx: mpsc::UnboundedSender<SessionUpdate>,
        result_tx: oneshot::Sender<Result<String>>,
    },
    Cancel,
    Shutdown,
}

struct TaskSession {
    cmd_tx: mpsc::Sender<AgentCommand>,
    info: SessionInfo,
}

#[derive(Serialize)]
struct RpcRequest {
    jsonrpc: &'static str,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct RpcNotification {
    jsonrpc: &'static str,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
struct RpcMessage {
    #[allow(dead_code)]
    jsonrpc: String,
    #[serde(default)]
    id: Option<serde_json::Value>,
    #[serde(default)]
    method: Option<String>,
    #[serde(default)]
    result: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<serde_json::Value>,
    #[serde(default)]
    params: Option<serde_json::Value>,
}

impl RpcMessage {
    fn is_response(&self) -> bool {
        self.id.is_some() && self.method.is_none()
    }

    fn is_notification(&self) -> bool {
        self.method.is_some() && self.id.is_none()
    }

    fn is_request(&self) -> bool {
        self.method.is_some() && self.id.is_some()
    }
}

pub struct SessionManager {
    home_dir: PathBuf,
    sessions: Mutex<HashMap<String, TaskSession>>,
}

impl SessionManager {
    pub fn new(home_dir: PathBuf) -> Self {
        Self {
            home_dir,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn has_session(&self, task_id: &str) -> bool {
        self.sessions.lock().unwrap().contains_key(task_id)
    }

    pub async fn start(&self, task: &Task) -> Result<SessionInfo> {
        if let Some(existing) = self.sessions.lock().unwrap().get(&task.id) {
            return Ok(existing.info.clone());
        }

        let provider = task.provider.clone();
        let task_id = task.id.clone();
        let cwd = PathBuf::from(task.worktree_path.clone());
        let program = provider.program_name();

        let mut child: Child = Command::new(program)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|error| anyhow!("failed to spawn {program}: {error}"))?;

        let stdin = child.stdin.take().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        let task_id_for_stderr = task_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[acp:{task_id_for_stderr}:stderr] {line}");
            }
        });

        let (msg_tx, mut msg_rx) = mpsc::channel::<RpcMessage>(64);
        let task_id_for_reader = task_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                match serde_json::from_str::<RpcMessage>(&line) {
                    Ok(message) => {
                        if msg_tx.send(message).await.is_err() {
                            break;
                        }
                    }
                    Err(error) => {
                        eprintln!("[acp:{task_id_for_reader}] parse error: {error}");
                    }
                }
            }
        });

        let mut connection = AcpConnection::new(stdin, task_id.clone());
        initialize_connection(&mut connection, &mut msg_rx, &task_id, &cwd).await?;
        let provider_session_id =
            create_provider_session(&mut connection, &mut msg_rx, &cwd).await?;

        let info = SessionInfo {
            provider_session_id: provider_session_id.clone(),
            provider_log_path: default_log_path(&provider, &self.home_dir),
        };

        let (cmd_tx, cmd_rx) = mpsc::channel(8);
        tokio::spawn(agent_command_loop(
            child,
            connection,
            msg_rx,
            cmd_rx,
            task_id.clone(),
            provider_session_id,
        ));

        self.sessions
            .lock()
            .unwrap()
            .insert(task_id, TaskSession { cmd_tx, info: info.clone() });

        Ok(info)
    }

    pub async fn send_prompt(
        &self,
        task_id: &str,
        text: &str,
        updates_tx: mpsc::UnboundedSender<SessionUpdate>,
    ) -> Result<String> {
        let cmd_tx = self
            .sessions
            .lock()
            .unwrap()
            .get(task_id)
            .ok_or_else(|| anyhow!("no session for task {task_id}"))?
            .cmd_tx
            .clone();

        let (result_tx, result_rx) = oneshot::channel();
        cmd_tx
            .send(AgentCommand::Prompt {
                text: text.to_string(),
                updates_tx,
                result_tx,
            })
            .await
            .map_err(|_| anyhow!("session closed"))?;

        result_rx.await.map_err(|_| anyhow!("session dropped"))?
    }

    pub async fn cancel(&self, task_id: &str) -> Result<()> {
        let cmd_tx = self
            .sessions
            .lock()
            .unwrap()
            .get(task_id)
            .ok_or_else(|| anyhow!("no session for task {task_id}"))?
            .cmd_tx
            .clone();
        cmd_tx
            .send(AgentCommand::Cancel)
            .await
            .map_err(|_| anyhow!("session closed"))?;
        Ok(())
    }

    pub async fn stop(&self, task_id: &str) -> Result<()> {
        let session = self.sessions.lock().unwrap().remove(task_id);
        if let Some(session) = session {
            let _ = session.cmd_tx.send(AgentCommand::Shutdown).await;
        }
        Ok(())
    }
}

async fn initialize_connection(
    connection: &mut AcpConnection,
    msg_rx: &mut mpsc::Receiver<RpcMessage>,
    task_id: &str,
    cwd: &Path,
) -> Result<()> {
    let init_params = serde_json::json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": { "readTextFile": true, "writeTextFile": true },
            "terminal": true
        },
        "clientInfo": {
            "name": "vega",
            "title": "Vega",
            "version": "0.1.0"
        }
    });
    connection
        .request(msg_rx, "initialize", Some(init_params), None)
        .await?;
    eprintln!("[acp:{task_id}] initialized for {}", cwd.display());
    Ok(())
}

async fn create_provider_session(
    connection: &mut AcpConnection,
    msg_rx: &mut mpsc::Receiver<RpcMessage>,
    cwd: &Path,
) -> Result<String> {
    let session_params = serde_json::json!({
        "cwd": cwd.to_string_lossy(),
        "mcpServers": []
    });
    let session_result = connection
        .request(msg_rx, "session/new", Some(session_params), None)
        .await?;
    session_result
        .get("sessionId")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .ok_or_else(|| anyhow!("missing sessionId in session/new response"))
}

async fn agent_command_loop(
    mut child: Child,
    mut connection: AcpConnection,
    mut msg_rx: mpsc::Receiver<RpcMessage>,
    mut cmd_rx: mpsc::Receiver<AgentCommand>,
    task_id: String,
    provider_session_id: String,
) {
    while let Some(command) = cmd_rx.recv().await {
        match command {
            AgentCommand::Prompt {
                text,
                updates_tx,
                result_tx,
            } => {
                let prompt_params = serde_json::json!({
                    "sessionId": provider_session_id,
                    "prompt": [{ "type": "text", "text": text }]
                });

                let result = connection
                    .request(
                        &mut msg_rx,
                        "session/prompt",
                        Some(prompt_params),
                        Some(&updates_tx),
                    )
                    .await;

                match result {
                    Ok(value) => {
                        let stop_reason = value
                            .get("stopReason")
                            .and_then(|entry| entry.as_str())
                            .unwrap_or("end_turn")
                            .to_string();
                        let _ = updates_tx.send(SessionUpdate::Done {
                            stop_reason: stop_reason.clone(),
                        });
                        let _ = result_tx.send(Ok(stop_reason));
                    }
                    Err(error) => {
                        let _ = updates_tx.send(SessionUpdate::Error {
                            message: error.to_string(),
                        });
                        let _ = result_tx.send(Err(error));
                    }
                }
            }
            AgentCommand::Cancel => {
                let _ = connection
                    .notify(
                        "session/cancel",
                        Some(serde_json::json!({ "sessionId": provider_session_id })),
                    )
                    .await;
            }
            AgentCommand::Shutdown => break,
        }
    }

    child.kill().await.ok();
    eprintln!("[acp:{task_id}] session stopped");
}

fn default_log_path(provider: &Provider, home_dir: &Path) -> Option<String> {
    let path = match provider {
        Provider::Codex => home_dir.join(".codex").join("sessions"),
        Provider::Claude => home_dir.join(".claude").join("projects"),
    };
    Some(path.display().to_string())
}

struct AcpConnection {
    writer: tokio::process::ChildStdin,
    next_id: u64,
    task_id: String,
}

impl AcpConnection {
    fn new(writer: tokio::process::ChildStdin, task_id: String) -> Self {
        Self {
            writer,
            next_id: 0,
            task_id,
        }
    }

    async fn request(
        &mut self,
        msg_rx: &mut mpsc::Receiver<RpcMessage>,
        method: &str,
        params: Option<serde_json::Value>,
        updates_tx: Option<&mpsc::UnboundedSender<SessionUpdate>>,
    ) -> Result<serde_json::Value> {
        let id = self.next_id;
        self.next_id += 1;

        let request = RpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };
        self.write_json(&request).await?;

        loop {
            let message = msg_rx
                .recv()
                .await
                .ok_or_else(|| anyhow!("agent closed while waiting for {method}"))?;

            if message.is_response() {
                if self.response_matches(&message, id) {
                    if let Some(error) = message.error {
                        return Err(anyhow!("rpc error on {method}: {error}"));
                    }
                    return Ok(message.result.unwrap_or(serde_json::Value::Null));
                }
            } else if message.is_notification() {
                self.handle_notification(&message, updates_tx);
            } else if message.is_request() {
                self.handle_agent_request(&message).await;
            }
        }
    }

    async fn notify(&mut self, method: &str, params: Option<serde_json::Value>) -> Result<()> {
        let notification = RpcNotification {
            jsonrpc: "2.0",
            method: method.to_string(),
            params,
        };
        self.write_json(&notification).await
    }

    fn response_matches(&self, message: &RpcMessage, expected_id: u64) -> bool {
        match &message.id {
            Some(serde_json::Value::Number(number)) => number.as_u64() == Some(expected_id),
            _ => false,
        }
    }

    async fn write_json(&mut self, value: &impl Serialize) -> Result<()> {
        let mut line = serde_json::to_string(value)?;
        line.push('\n');
        self.writer.write_all(line.as_bytes()).await?;
        self.writer.flush().await?;
        Ok(())
    }

    fn handle_notification(
        &self,
        message: &RpcMessage,
        updates_tx: Option<&mpsc::UnboundedSender<SessionUpdate>>,
    ) {
        if message.method.as_deref() != Some("session/update") {
            return;
        }

        let Some(params) = &message.params else {
            return;
        };
        let Some(update) = params.get("update") else {
            return;
        };

        let update_kind = update
            .get("sessionUpdate")
            .and_then(|value| value.as_str())
            .unwrap_or("unknown");

        let parsed = match update_kind {
            "agent_message_chunk" => parse_text_chunk(update),
            "agent_thought_chunk" => parse_thinking_chunk(update),
            "tool_call" => parse_tool_call(update),
            "tool_call_update" => parse_tool_call_update(update),
            "plan" => parse_plan(update),
            "user_message_chunk"
            | "available_commands_update"
            | "current_mode_update"
            | "config_option_update"
            | "session_info_update" => None,
            _ => None,
        };

        if let (Some(parsed), Some(tx)) = (parsed, updates_tx) {
            let _ = tx.send(parsed);
        }
    }

    async fn handle_agent_request(&mut self, message: &RpcMessage) {
        let method = message.method.as_deref().unwrap_or("");
        let id = message.id.clone().unwrap_or(serde_json::Value::Null);

        let result = match method {
            "session/request_permission" => self.handle_permission_request(message.params.as_ref()),
            "fs/read_text_file" => self.handle_read_file(message.params.as_ref()).await,
            "fs/write_text_file" => self.handle_write_file(message.params.as_ref()).await,
            "terminal/create" => Ok(serde_json::json!({ "terminalId": "vega-stub-term" })),
            "terminal/output" => Ok(serde_json::json!({
                "output": "",
                "truncated": false,
                "exitStatus": { "exitCode": 0 }
            })),
            "terminal/wait_for_exit" => Ok(serde_json::json!({ "exitCode": 0 })),
            "terminal/release" | "terminal/kill" => Ok(serde_json::json!({})),
            other => Err(anyhow!("unknown agent request: {other}")),
        };

        match result {
            Ok(value) => self.respond_ok(&id, value).await,
            Err(error) => self.respond_error(&id, -32000, &error.to_string()).await,
        }
    }

    fn handle_permission_request(
        &self,
        params: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let option_id = params
            .and_then(|entry| entry.get("options"))
            .and_then(|value| value.as_array())
            .and_then(|options| {
                options.iter().find_map(|option| {
                    let kind = option.get("kind")?.as_str()?;
                    if kind == "allow_once" || kind == "allow_always" {
                        option.get("optionId")?.as_str().map(str::to_string)
                    } else {
                        None
                    }
                })
            });

        Ok(match option_id {
            Some(option_id) => serde_json::json!({
                "outcome": { "outcome": "selected", "optionId": option_id }
            }),
            None => serde_json::json!({
                "outcome": { "outcome": "cancelled" }
            }),
        })
    }

    async fn handle_read_file(
        &self,
        params: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let path = params
            .and_then(|entry| entry.get("path"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("missing path"))?;
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|error| anyhow!("read {path}: {error}"))?;
        Ok(serde_json::json!({ "content": content }))
    }

    async fn handle_write_file(
        &self,
        params: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value> {
        let path = params
            .and_then(|entry| entry.get("path"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("missing path"))?;
        let content = params
            .and_then(|entry| entry.get("content"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| anyhow!("missing content"))?;
        if let Some(parent) = Path::new(path).parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        tokio::fs::write(path, content).await?;
        Ok(serde_json::json!({}))
    }

    async fn respond_ok(&mut self, id: &serde_json::Value, result: serde_json::Value) {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result
        });
        if let Err(error) = self.write_json(&payload).await {
            eprintln!("[acp:{}] failed to respond ok: {error}", self.task_id);
        }
    }

    async fn respond_error(&mut self, id: &serde_json::Value, code: i32, message: &str) {
        let payload = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": code, "message": message }
        });
        if let Err(error) = self.write_json(&payload).await {
            eprintln!("[acp:{}] failed to respond error: {error}", self.task_id);
        }
    }
}

fn parse_text_chunk(update: &serde_json::Value) -> Option<SessionUpdate> {
    let text = update.get("content")?.get("text")?.as_str()?.to_string();
    if text.is_empty() {
        return None;
    }
    Some(SessionUpdate::TextChunk { text })
}

fn parse_thinking_chunk(update: &serde_json::Value) -> Option<SessionUpdate> {
    let text = update.get("content")?.get("text")?.as_str()?.to_string();
    if text.is_empty() {
        return None;
    }
    Some(SessionUpdate::ThinkingChunk { text })
}

fn parse_tool_call(update: &serde_json::Value) -> Option<SessionUpdate> {
    Some(SessionUpdate::ToolCall {
        tool_call_id: jstr(update, "toolCallId"),
        title: jstr(update, "title"),
        kind: jstr(update, "kind"),
        status: jstr(update, "status"),
        content: parse_tool_content(update),
    })
}

fn parse_tool_call_update(update: &serde_json::Value) -> Option<SessionUpdate> {
    Some(SessionUpdate::ToolCallUpdate {
        tool_call_id: jstr(update, "toolCallId"),
        status: jstr(update, "status"),
        content: parse_tool_content(update),
    })
}

fn parse_plan(update: &serde_json::Value) -> Option<SessionUpdate> {
    let entries = update
        .get("entries")
        .and_then(|value| value.as_array())
        .map(|entries| {
            entries
                .iter()
                .map(|entry| PlanEntry {
                    content: jstr(entry, "content"),
                    status: jstr(entry, "status"),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Some(SessionUpdate::Plan { entries })
}

fn parse_tool_content(update: &serde_json::Value) -> Vec<ToolContent> {
    let Some(items) = update.get("content").and_then(|value| value.as_array()) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| match item.get("type").and_then(|value| value.as_str()) {
            Some("diff") => Some(ToolContent::Diff {
                path: jstr(item, "path"),
                old_text: item
                    .get("oldText")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                new_text: jstr(item, "newText"),
            }),
            Some("content") => Some(ToolContent::Text {
                text: item
                    .get("content")
                    .and_then(|content| content.get("text"))
                    .and_then(|value| value.as_str())
                    .unwrap_or_default()
                    .to_string(),
            }),
            Some("terminal") => Some(ToolContent::Text {
                text: format!("[terminal: {}]", jstr(item, "terminalId")),
            }),
            _ => item
                .get("text")
                .and_then(|value| value.as_str())
                .map(|text| ToolContent::Text {
                    text: text.to_string(),
                }),
        })
        .collect()
}

fn jstr(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|entry| entry.as_str())
        .unwrap_or_default()
        .to_string()
}
