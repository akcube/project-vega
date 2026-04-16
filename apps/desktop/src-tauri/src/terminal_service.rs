use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;

use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use tauri::async_runtime;
use tauri::ipc::Channel;
use tokio::sync::broadcast;

use crate::view_model::{TerminalEvent, TerminalSnapshot};

struct TerminalSession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    buffer: Mutex<String>,
    tx: broadcast::Sender<TerminalEvent>,
}

#[derive(Default)]
pub struct TerminalService {
    sessions: Mutex<HashMap<String, Arc<TerminalSession>>>,
}

impl TerminalService {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn attach(
        &self,
        task_id: &str,
        cwd: &Path,
        cols: u16,
        rows: u16,
        on_event: Channel<TerminalEvent>,
    ) -> Result<TerminalSnapshot> {
        let session = self.ensure_session(task_id, cwd, cols, rows)?;
        let mut rx = session.tx.subscribe();
        async_runtime::spawn(async move {
            while let Ok(event) = rx.recv().await {
                on_event.send(event).ok();
            }
        });

        Ok(TerminalSnapshot {
            output: session.buffer.lock().unwrap().clone(),
        })
    }

    pub fn write(&self, task_id: &str, data: &str) -> Result<()> {
        let session = self.session(task_id)?;
        let mut writer = session.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .map_err(|error| anyhow!("write terminal input: {error}"))?;
        writer
            .flush()
            .map_err(|error| anyhow!("flush terminal input: {error}"))?;
        Ok(())
    }

    pub fn resize(&self, task_id: &str, cols: u16, rows: u16) -> Result<()> {
        let session = self.session(task_id)?;
        session
            .master
            .lock()
            .unwrap()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| anyhow!("resize terminal: {error}"))?;
        Ok(())
    }

    pub fn stop(&self, task_id: &str) -> Result<()> {
        let session = self.sessions.lock().unwrap().remove(task_id);
        if let Some(session) = session {
            let _ = session.killer.lock().unwrap().kill();
        }
        Ok(())
    }

    fn ensure_session(
        &self,
        task_id: &str,
        cwd: &Path,
        cols: u16,
        rows: u16,
    ) -> Result<Arc<TerminalSession>> {
        if let Some(existing) = self.sessions.lock().unwrap().get(task_id) {
            return Ok(existing.clone());
        }

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| anyhow!("open pty: {error}"))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut command = CommandBuilder::new(shell);
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| anyhow!("spawn terminal shell: {error}"))?;
        let killer = child.clone_killer();
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| anyhow!("open terminal writer: {error}"))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| anyhow!("open terminal reader: {error}"))?;

        let (tx, _) = broadcast::channel(256);
        let session = Arc::new(TerminalSession {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            killer: Mutex::new(killer),
            buffer: Mutex::new(String::new()),
            tx,
        });

        let reader_session = session.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(size) => {
                        let data = String::from_utf8_lossy(&buffer[..size]).to_string();
                        reader_session.buffer.lock().unwrap().push_str(&data);
                        let _ = reader_session.tx.send(TerminalEvent::Output { data });
                    }
                    Err(_) => break,
                }
            }
        });

        let wait_session = session.clone();
        thread::spawn(move || {
            let exit_code = wait_session
                .child
                .lock()
                .unwrap()
                .wait()
                .ok()
                .map(|status| status.exit_code() as i32)
                .unwrap_or_default();
            let _ = wait_session.tx.send(TerminalEvent::Exit { exit_code });
        });

        self.sessions
            .lock()
            .unwrap()
            .insert(task_id.to_string(), session.clone());

        Ok(session)
    }

    fn session(&self, task_id: &str) -> Result<Arc<TerminalSession>> {
        self.sessions
            .lock()
            .unwrap()
            .get(task_id)
            .cloned()
            .ok_or_else(|| anyhow!("no terminal session for task {task_id}"))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::time::Duration;

    use super::*;
    use tempfile::tempdir;

    #[test]
    fn stopping_a_live_terminal_session_does_not_deadlock() {
        let temp = tempdir().unwrap();
        let service = Arc::new(TerminalService::new());
        service
            .ensure_session("task-1", temp.path(), 80, 24)
            .unwrap();

        let (tx, rx) = mpsc::channel();
        let service_for_stop = service.clone();
        thread::spawn(move || {
            let result = service_for_stop.stop("task-1");
            tx.send(result.is_ok()).ok();
        });

        assert_eq!(rx.recv_timeout(Duration::from_secs(2)).unwrap(), true);
    }
}
