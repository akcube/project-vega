use std::path::Path;
use std::sync::Mutex;

use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::domain::{
    AddProjectResourceInput, CreateProjectInput, CreateTaskInput, Project, ProjectResource,
    ProjectResourceKind, Provider, Run, RunStatus, Task, TaskStatus, TaskView,
};
use crate::events::WorkspaceEvent;
use crate::view_model::WorkspaceSnapshot;

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn new(data_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(data_dir)?;
        let conn = Connection::open(data_dir.join("vega.db"))?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_resources (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                label TEXT NOT NULL,
                locator TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                worktree_path TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                permission_policy TEXT NOT NULL,
                mcp_subset_json TEXT NOT NULL,
                skill_subset_json TEXT NOT NULL,
                current_run_id TEXT,
                last_open_view TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                status TEXT NOT NULL,
                provider_session_id TEXT,
                provider_log_path TEXT,
                config_snapshot_json TEXT NOT NULL,
                started_at TEXT NOT NULL,
                ended_at TEXT
            );

            CREATE TABLE IF NOT EXISTS task_events (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                seq INTEGER NOT NULL,
                kind TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspace_snapshots (
                task_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn create_project(&self, input: CreateProjectInput) -> Result<Project> {
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            description: input.description,
            created_at: now(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![project.id, project.name, project.description, project.created_at],
        )?;
        Ok(project)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, created_at FROM projects ORDER BY created_at DESC",
        )?;
        stmt.query_map([], project_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn get_project(&self, project_id: &str) -> Result<Project> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT id, name, description, created_at FROM projects WHERE id = ?1")?;
        let project = stmt
            .query_row([project_id], project_from_row)
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("project not found: {project_id}"))?;
        Ok(project)
    }

    pub fn add_project_resource(&self, input: AddProjectResourceInput) -> Result<ProjectResource> {
        let resource = ProjectResource {
            id: Uuid::new_v4().to_string(),
            project_id: input.project_id,
            kind: input.kind,
            label: input.label,
            locator: input.locator,
            metadata: Value::Null,
            created_at: now(),
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO project_resources (id, project_id, kind, label, locator, metadata_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                resource.id,
                resource.project_id,
                resource.kind.as_str(),
                resource.label,
                resource.locator,
                serialize_json(&resource.metadata)?,
                resource.created_at
            ],
        )?;
        Ok(resource)
    }

    pub fn list_project_resources(&self, project_id: &str) -> Result<Vec<ProjectResource>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, project_id, kind, label, locator, metadata_json, created_at
            FROM project_resources
            WHERE project_id = ?1
            ORDER BY created_at ASC
            "#,
        )?;
        stmt.query_map([project_id], project_resource_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn create_task(&self, input: CreateTaskInput) -> Result<Task> {
        let timestamp = now();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            project_id: input.project_id,
            title: input.title,
            status: TaskStatus::Idle,
            worktree_path: input.worktree_path,
            provider: input.provider,
            model: input.model,
            permission_policy: "default".to_string(),
            mcp_subset: Vec::new(),
            skill_subset: Vec::new(),
            current_run_id: None,
            last_open_view: TaskView::Agent,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO tasks (
                id, project_id, title, status, worktree_path, provider, model, permission_policy,
                mcp_subset_json, skill_subset_json, current_run_id, last_open_view, created_at, updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            "#,
            params![
                task.id,
                task.project_id,
                task.title,
                task.status.as_str(),
                task.worktree_path,
                task.provider.as_str(),
                task.model,
                task.permission_policy,
                serialize_json(&task.mcp_subset)?,
                serialize_json(&task.skill_subset)?,
                task.current_run_id,
                task.last_open_view.as_str(),
                task.created_at,
                task.updated_at,
            ],
        )?;
        Ok(task)
    }

    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, project_id, title, status, worktree_path, provider, model, permission_policy,
                   mcp_subset_json, skill_subset_json, current_run_id, last_open_view, created_at, updated_at
            FROM tasks
            WHERE project_id = ?1
            ORDER BY updated_at DESC
            "#,
        )?;
        stmt.query_map([project_id], task_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn get_task(&self, task_id: &str) -> Result<Task> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, project_id, title, status, worktree_path, provider, model, permission_policy,
                   mcp_subset_json, skill_subset_json, current_run_id, last_open_view, created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
        )?;
        let task = stmt
            .query_row([task_id], task_from_row)
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("task not found: {task_id}"))?;
        Ok(task)
    }

    pub fn update_task_status(&self, task_id: &str, status: TaskStatus) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status.as_str(), now(), task_id],
        )?;
        Ok(())
    }

    pub fn set_last_open_view(&self, task_id: &str, view: TaskView) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE tasks SET last_open_view = ?1, updated_at = ?2 WHERE id = ?3",
            params![view.as_str(), now(), task_id],
        )?;
        Ok(())
    }

    pub fn create_run(&self, task: &Task) -> Result<Run> {
        let run = Run {
            id: Uuid::new_v4().to_string(),
            task_id: task.id.clone(),
            provider: task.provider.clone(),
            status: RunStatus::Ready,
            provider_session_id: None,
            provider_log_path: None,
            config_snapshot: json!({
                "provider": task.provider,
                "model": task.model,
                "worktreePath": task.worktree_path,
                "permissionPolicy": task.permission_policy,
                "mcpSubset": task.mcp_subset,
                "skillSubset": task.skill_subset,
            }),
            started_at: now(),
            ended_at: None,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"
            INSERT INTO runs (
                id, task_id, provider, status, provider_session_id, provider_log_path,
                config_snapshot_json, started_at, ended_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                run.id,
                run.task_id,
                run.provider.as_str(),
                run.status.as_str(),
                run.provider_session_id,
                run.provider_log_path,
                serialize_json(&run.config_snapshot)?,
                run.started_at,
                run.ended_at,
            ],
        )?;
        conn.execute(
            "UPDATE tasks SET current_run_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![run.id, now(), task.id],
        )?;
        Ok(run)
    }

    pub fn get_current_run(&self, task_id: &str) -> Result<Option<Run>> {
        let task = self.get_task(task_id)?;
        match task.current_run_id {
            Some(run_id) => self.get_run(&run_id),
            None => Ok(None),
        }
    }

    pub fn get_run(&self, run_id: &str) -> Result<Option<Run>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, task_id, provider, status, provider_session_id, provider_log_path,
                   config_snapshot_json, started_at, ended_at
            FROM runs
            WHERE id = ?1
            "#,
        )?;
        stmt.query_row([run_id], run_from_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn update_run_status(&self, run_id: &str, status: RunStatus) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE runs SET status = ?1, ended_at = ?2 WHERE id = ?3",
            params![
                status.as_str(),
                match status {
                    RunStatus::Cancelled | RunStatus::Failed => Some(now()),
                    _ => None,
                },
                run_id
            ],
        )?;
        Ok(())
    }

    pub fn update_run_locator(
        &self,
        run_id: &str,
        provider_session_id: Option<&str>,
        provider_log_path: Option<&str>,
    ) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE runs SET provider_session_id = ?1, provider_log_path = ?2 WHERE id = ?3",
            params![provider_session_id, provider_log_path, run_id],
        )?;
        Ok(())
    }

    pub fn append_task_event(
        &self,
        task_id: &str,
        run_id: &str,
        event: &WorkspaceEvent,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let next_seq: i64 = conn.query_row(
            "SELECT COALESCE(MAX(seq), 0) + 1 FROM task_events WHERE task_id = ?1 AND run_id = ?2",
            params![task_id, run_id],
            |row| row.get(0),
        )?;

        conn.execute(
            r#"
            INSERT INTO task_events (id, task_id, run_id, seq, kind, payload_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                Uuid::new_v4().to_string(),
                task_id,
                run_id,
                next_seq,
                event.kind(),
                serialize_json(event)?,
                now(),
            ],
        )?;
        Ok(next_seq)
    }

    pub fn list_task_events(&self, run_id: &str) -> Result<Vec<WorkspaceEvent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT payload_json
            FROM task_events
            WHERE run_id = ?1
            ORDER BY seq ASC
            "#,
        )?;
        let rows = stmt.query_map([run_id], |row| row.get::<_, String>(0))?;
        let payloads = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        payloads
            .into_iter()
            .map(|payload| deserialize_json(&payload))
            .collect()
    }

    pub fn save_snapshot(
        &self,
        task_id: &str,
        run_id: &str,
        snapshot: &WorkspaceSnapshot,
    ) -> Result<()> {
        self.conn.lock().unwrap().execute(
            r#"
            INSERT INTO workspace_snapshots (task_id, run_id, snapshot_json, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(task_id) DO UPDATE SET
                run_id = excluded.run_id,
                snapshot_json = excluded.snapshot_json,
                updated_at = excluded.updated_at
            "#,
            params![task_id, run_id, serialize_json(snapshot)?, now()],
        )?;
        Ok(())
    }

    pub fn load_snapshot(&self, task_id: &str) -> Result<Option<(String, WorkspaceSnapshot)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT run_id, snapshot_json FROM workspace_snapshots WHERE task_id = ?1",
        )?;
        let row = stmt
            .query_row([task_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .optional()?;

        match row {
            Some((run_id, payload)) => Ok(Some((run_id, deserialize_json(&payload)?))),
            None => Ok(None),
        }
    }
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
    })
}

fn project_resource_from_row(row: &Row<'_>) -> rusqlite::Result<ProjectResource> {
    Ok(ProjectResource {
        id: row.get(0)?,
        project_id: row.get(1)?,
        kind: ProjectResourceKind::from_str(&row.get::<_, String>(2)?)
            .map_err(to_sql_error)?,
        label: row.get(3)?,
        locator: row.get(4)?,
        metadata: deserialize_json(&row.get::<_, String>(5)?).map_err(to_sql_error)?,
        created_at: row.get(6)?,
    })
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        status: TaskStatus::from_str(&row.get::<_, String>(3)?).map_err(to_sql_error)?,
        worktree_path: row.get(4)?,
        provider: Provider::from_str(&row.get::<_, String>(5)?).map_err(to_sql_error)?,
        model: row.get(6)?,
        permission_policy: row.get(7)?,
        mcp_subset: deserialize_json(&row.get::<_, String>(8)?).map_err(to_sql_error)?,
        skill_subset: deserialize_json(&row.get::<_, String>(9)?).map_err(to_sql_error)?,
        current_run_id: row.get(10)?,
        last_open_view: TaskView::from_str(&row.get::<_, String>(11)?).map_err(to_sql_error)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn run_from_row(row: &Row<'_>) -> rusqlite::Result<Run> {
    Ok(Run {
        id: row.get(0)?,
        task_id: row.get(1)?,
        provider: Provider::from_str(&row.get::<_, String>(2)?).map_err(to_sql_error)?,
        status: RunStatus::from_str(&row.get::<_, String>(3)?).map_err(to_sql_error)?,
        provider_session_id: row.get(4)?,
        provider_log_path: row.get(5)?,
        config_snapshot: deserialize_json(&row.get::<_, String>(6)?).map_err(to_sql_error)?,
        started_at: row.get(7)?,
        ended_at: row.get(8)?,
    })
}

fn serialize_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).map_err(Into::into)
}

fn deserialize_json<T: DeserializeOwned>(value: &str) -> Result<T> {
    serde_json::from_str(value).map_err(Into::into)
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn to_sql_error(error: anyhow::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::other(error.to_string())),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn store_round_trips_projects_tasks_events_and_snapshots() {
        let temp = tempdir().unwrap();
        let store = Store::new(temp.path()).unwrap();

        let project = store
            .create_project(CreateProjectInput {
                name: "Core".to_string(),
                description: "Main codebase".to_string(),
            })
            .unwrap();

        store
            .add_project_resource(AddProjectResourceInput {
                project_id: project.id.clone(),
                kind: ProjectResourceKind::Repo,
                label: "project-vega".to_string(),
                locator: "/tmp/project-vega".to_string(),
            })
            .unwrap();

        let task = store
            .create_task(CreateTaskInput {
                project_id: project.id.clone(),
                title: "Bootstrap app".to_string(),
                worktree_path: "/tmp/project-vega".to_string(),
                provider: Provider::Codex,
                model: "gpt-5-codex".to_string(),
            })
            .unwrap();

        let run = store.create_run(&task).unwrap();
        store
            .append_task_event(
                &task.id,
                &run.id,
                &WorkspaceEvent::UserMessage {
                    text: "Hello".to_string(),
                },
            )
            .unwrap();
        store
            .save_snapshot(
                &task.id,
                &run.id,
                &WorkspaceSnapshot {
                    messages: Vec::new(),
                    current_message: None,
                },
            )
            .unwrap();

        let tasks = store.list_tasks(&project.id).unwrap();
        assert_eq!(tasks.len(), 1);
        let events = store.list_task_events(&run.id).unwrap();
        assert_eq!(events.len(), 1);
        let snapshot = store.load_snapshot(&task.id).unwrap();
        assert!(snapshot.is_some());
    }
}
