use std::path::Path;
use std::sync::Mutex;

use anyhow::Result;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::domain::{
    ActiveWorkspace, AddProjectResourceInput, CreateProjectInput, Project, ProjectLifecycleState,
    ProjectResource, ProjectResourceKind, Provider, Run, RunStatus, Task, WorkflowState,
    WorkspaceView,
};
use crate::events::WorkspaceEvent;
use crate::feed::{FeedEntry, FeedEntryKind};
use crate::view_model::WorkspaceSnapshot;

const SCHEMA_VERSION: i64 = 5;

pub struct Store {
    conn: Mutex<Connection>,
}

impl Store {
    pub fn new(data_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(data_dir)?;
        let conn = Connection::open(data_dir.join("vega.db"))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        apply_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn create_project(&self, input: CreateProjectInput) -> Result<Project> {
        let project = Project {
            id: Uuid::new_v4().to_string(),
            name: input.name,
            brief: input.brief,
            plan_markdown: input.plan_markdown,
            lifecycle_state: ProjectLifecycleState::Active,
            created_at: now(),
        };

        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        // Keep the legacy description column populated for older readers of the local DB.
        let legacy_description = project.brief.clone();
        tx.execute(
            r#"
            INSERT INTO projects (
                id, name, description, brief, plan_markdown, lifecycle_state, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                project.id,
                project.name,
                legacy_description,
                project.brief,
                project.plan_markdown,
                project.lifecycle_state.as_str(),
                project.created_at,
            ],
        )?;

        for resource in input.resources {
            let created = ProjectResource {
                id: Uuid::new_v4().to_string(),
                project_id: project.id.clone(),
                kind: resource.kind,
                label: resource.label,
                locator: resource.locator,
                metadata: Value::Null,
                created_at: now(),
            };
            tx.execute(
                r#"
                INSERT INTO project_resources (
                    id, project_id, kind, label, locator, metadata_json, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    created.id,
                    created.project_id,
                    created.kind.as_str(),
                    created.label,
                    created.locator,
                    serialize_json(&created.metadata)?,
                    created.created_at
                ],
            )?;
        }

        tx.commit()?;
        Ok(project)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, brief, plan_markdown, lifecycle_state, created_at
            FROM projects
            WHERE lifecycle_state = 'active'
            ORDER BY created_at DESC
            "#,
        )?;
        stmt.query_map([], project_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn get_project(&self, project_id: &str) -> Result<Project> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, brief, plan_markdown, lifecycle_state, created_at
            FROM projects
            WHERE id = ?1
            "#,
        )?;
        stmt.query_row([project_id], project_from_row)
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("project not found: {project_id}"))
    }

    pub fn delete_project(&self, project_id: &str) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let task_ids = {
            let mut stmt = tx.prepare("SELECT id FROM tasks WHERE project_id = ?1")?;
            let rows = stmt.query_map([project_id], |row| row.get::<_, String>(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        for task_id in &task_ids {
            delete_task_records(&tx, task_id)?;
        }

        tx.execute("DELETE FROM project_resources WHERE project_id = ?1", [project_id])?;
        tx.execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
        tx.commit()?;

        Ok(())
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
            INSERT INTO project_resources (
                id, project_id, kind, label, locator, metadata_json, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
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

    pub fn list_project_repositories(&self, project_id: &str) -> Result<Vec<ProjectResource>> {
        Ok(self
            .list_project_resources(project_id)?
            .into_iter()
            .filter(|resource| resource.kind == ProjectResourceKind::Repo)
            .collect())
    }

    pub fn list_project_documents(&self, project_id: &str) -> Result<Vec<ProjectResource>> {
        Ok(self
            .list_project_resources(project_id)?
            .into_iter()
            .filter(|resource| resource.kind == ProjectResourceKind::Doc)
            .collect())
    }

    pub fn get_project_resource(&self, resource_id: &str) -> Result<ProjectResource> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, project_id, kind, label, locator, metadata_json, created_at
            FROM project_resources
            WHERE id = ?1
            "#,
        )?;
        stmt.query_row([resource_id], project_resource_from_row)
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("project resource not found: {resource_id}"))
    }

    pub fn insert_task(&self, task: &Task) -> Result<()> {
        self.conn.lock().unwrap().execute(
            r#"
            INSERT INTO tasks (
                id, project_id, title, status, workflow_state, source_repo_resource_id,
                worktree_path, worktree_name, branch_name, provider, model, permission_policy,
                mcp_subset_json, skill_subset_json, current_run_id, last_open_view, created_at, updated_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                ?7, ?8, ?9, ?10, ?11, ?12,
                ?13, ?14, ?15, ?16, ?17, ?18
            )
            "#,
            params![
                task.id,
                task.project_id,
                task.title,
                "idle",
                task.workflow_state.as_str(),
                task.source_repo_resource_id,
                task.worktree_path,
                task.worktree_name,
                task.branch_name,
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
        Ok(())
    }

    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT
                id, project_id, title, workflow_state, source_repo_resource_id, worktree_path,
                worktree_name, branch_name, provider, model, permission_policy, mcp_subset_json,
                skill_subset_json, current_run_id, last_open_view, created_at, updated_at
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
            SELECT
                id, project_id, title, workflow_state, source_repo_resource_id, worktree_path,
                worktree_name, branch_name, provider, model, permission_policy, mcp_subset_json,
                skill_subset_json, current_run_id, last_open_view, created_at, updated_at
            FROM tasks
            WHERE id = ?1
            "#,
        )?;
        stmt.query_row([task_id], task_from_row)
            .optional()?
            .ok_or_else(|| anyhow::anyhow!("task not found: {task_id}"))
    }

    pub fn update_task_workflow_state(
        &self,
        task_id: &str,
        workflow_state: WorkflowState,
    ) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE tasks SET workflow_state = ?1, updated_at = ?2 WHERE id = ?3",
            params![workflow_state.as_str(), now(), task_id],
        )?;
        Ok(())
    }

    pub fn set_last_open_view(&self, task_id: &str, view: WorkspaceView) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE tasks SET last_open_view = ?1, updated_at = ?2 WHERE id = ?3",
            params![view.as_str(), now(), task_id],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, task_id: &str) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        delete_task_records(&tx, task_id)?;
        tx.commit()?;
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
                "branchName": task.branch_name,
                "sourceRepoResourceId": task.source_repo_resource_id,
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
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
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
        let next_task_seq: i64 = conn.query_row(
            "SELECT COALESCE(MAX(task_seq), 0) + 1 FROM task_events WHERE task_id = ?1",
            params![task_id],
            |row| row.get(0),
        )?;

        conn.execute(
            r#"
            INSERT INTO task_events (id, task_id, run_id, seq, task_seq, kind, payload_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                Uuid::new_v4().to_string(),
                task_id,
                run_id,
                next_seq,
                next_task_seq,
                event.kind(),
                serialize_json(event)?,
                now(),
            ],
        )?;
        Ok(next_task_seq)
    }

    pub fn list_task_events(&self, task_id: &str) -> Result<Vec<WorkspaceEvent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT payload_json
            FROM task_events
            WHERE task_id = ?1
            ORDER BY task_seq ASC
            "#,
        )?;
        let rows = stmt.query_map([task_id], |row| row.get::<_, String>(0))?;
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

    pub fn ensure_active_workspace(
        &self,
        task_id: &str,
        default_view: WorkspaceView,
    ) -> Result<ActiveWorkspace> {
        if let Some(_workspace) = self.get_active_workspace(task_id)? {
            self.focus_workspace(task_id)?;
            return self
                .get_active_workspace(task_id)?
                .ok_or_else(|| anyhow::anyhow!("workspace disappeared for task {task_id}"));
        }

        {
            let conn = self.conn.lock().unwrap();
            let next_order: i64 = conn.query_row(
                "SELECT COALESCE(MAX(strip_order), 0) + 1 FROM active_workspaces",
                [],
                |row| row.get(0),
            )?;
            let timestamp = now();
            conn.execute(
                r#"
                INSERT INTO active_workspaces (task_id, selected_view, strip_order, last_focused_at)
                VALUES (?1, ?2, ?3, ?4)
                "#,
                params![task_id, default_view.as_str(), next_order, timestamp],
            )?;
        }
        self.get_active_workspace(task_id)?
            .ok_or_else(|| anyhow::anyhow!("failed to create workspace for task {task_id}"))
    }

    pub fn get_active_workspace(&self, task_id: &str) -> Result<Option<ActiveWorkspace>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT task_id, selected_view, strip_order, last_focused_at
            FROM active_workspaces
            WHERE task_id = ?1
            "#,
        )?;
        stmt.query_row([task_id], active_workspace_from_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn list_active_workspaces(&self) -> Result<Vec<ActiveWorkspace>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT task_id, selected_view, strip_order, last_focused_at
            FROM active_workspaces
            ORDER BY strip_order ASC
            "#,
        )?;
        stmt.query_map([], active_workspace_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn focus_workspace(&self, task_id: &str) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "UPDATE active_workspaces SET last_focused_at = ?1 WHERE task_id = ?2",
            params![now(), task_id],
        )?;
        Ok(())
    }

    pub fn update_active_workspace_view(
        &self,
        task_id: &str,
        view: WorkspaceView,
    ) -> Result<()> {
        let timestamp = now();
        self.conn.lock().unwrap().execute(
            r#"
            UPDATE active_workspaces
            SET selected_view = ?1, last_focused_at = ?2
            WHERE task_id = ?3
            "#,
            params![view.as_str(), timestamp, task_id],
        )?;
        self.set_last_open_view(task_id, view)?;
        Ok(())
    }

    pub fn close_active_workspace(&self, task_id: &str) -> Result<()> {
        self.conn
            .lock()
            .unwrap()
            .execute("DELETE FROM active_workspaces WHERE task_id = ?1", [task_id])?;
        Ok(())
    }

    // ── Feed entries ──────────────────────────────────────────────────────

    pub fn insert_feed_entry(&self, entry: &FeedEntry) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            r#"INSERT INTO feed_entries (id, task_id, run_id, kind, severity, title, summary, category, recommended_action, is_read, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"#,
            params![
                entry.id,
                entry.task_id,
                entry.run_id,
                entry.kind.as_str(),
                entry.severity,
                entry.title,
                entry.summary,
                entry.category,
                entry.recommended_action,
                entry.is_read as i32,
                entry.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_feed_entries(&self, limit: i64) -> Result<Vec<FeedEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT * FROM feed_entries ORDER BY created_at DESC LIMIT ?1",
        )?;
        let entries = stmt
            .query_map([limit], |row| {
                Ok(FeedEntry {
                    id: row.get("id")?,
                    task_id: row.get("task_id")?,
                    run_id: row.get("run_id")?,
                    kind: FeedEntryKind::from_str(&row.get::<_, String>("kind")?)
                        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?,
                    severity: row.get("severity")?,
                    title: row.get("title")?,
                    summary: row.get("summary")?,
                    category: row.get("category")?,
                    recommended_action: row.get("recommended_action")?,
                    is_read: row.get::<_, i32>("is_read")? != 0,
                    created_at: row.get("created_at")?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    }

    pub fn mark_feed_entry_read(&self, entry_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE feed_entries SET is_read = 1 WHERE id = ?1",
            [entry_id],
        )?;
        Ok(())
    }

    pub fn count_unread_feed_entries(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM feed_entries WHERE is_read = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }
}

fn project_from_row(row: &Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        brief: row.get("brief")?,
        plan_markdown: row.get("plan_markdown")?,
        lifecycle_state: ProjectLifecycleState::from_str(&row.get::<_, String>("lifecycle_state")?)
            .map_err(to_sql_error)?,
        created_at: row.get("created_at")?,
    })
}

fn project_resource_from_row(row: &Row<'_>) -> rusqlite::Result<ProjectResource> {
    Ok(ProjectResource {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        kind: ProjectResourceKind::from_str(&row.get::<_, String>("kind")?).map_err(to_sql_error)?,
        label: row.get("label")?,
        locator: row.get("locator")?,
        metadata: deserialize_json(&row.get::<_, String>("metadata_json")?).map_err(to_sql_error)?,
        created_at: row.get("created_at")?,
    })
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        workflow_state: WorkflowState::from_str(&row.get::<_, String>("workflow_state")?)
            .map_err(to_sql_error)?,
        source_repo_resource_id: row.get("source_repo_resource_id")?,
        worktree_path: row.get("worktree_path")?,
        worktree_name: row.get("worktree_name")?,
        branch_name: row.get("branch_name")?,
        provider: Provider::from_str(&row.get::<_, String>("provider")?).map_err(to_sql_error)?,
        model: row.get("model")?,
        permission_policy: row.get("permission_policy")?,
        mcp_subset: deserialize_json(&row.get::<_, String>("mcp_subset_json")?).map_err(to_sql_error)?,
        skill_subset: deserialize_json(&row.get::<_, String>("skill_subset_json")?).map_err(to_sql_error)?,
        current_run_id: row.get("current_run_id")?,
        last_open_view: WorkspaceView::from_str(&row.get::<_, String>("last_open_view")?)
            .map_err(to_sql_error)?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn active_workspace_from_row(row: &Row<'_>) -> rusqlite::Result<ActiveWorkspace> {
    Ok(ActiveWorkspace {
        task_id: row.get("task_id")?,
        selected_view: WorkspaceView::from_str(&row.get::<_, String>("selected_view")?)
            .map_err(to_sql_error)?,
        strip_order: row.get("strip_order")?,
        last_focused_at: row.get("last_focused_at")?,
    })
}

fn run_from_row(row: &Row<'_>) -> rusqlite::Result<Run> {
    Ok(Run {
        id: row.get("id")?,
        task_id: row.get("task_id")?,
        provider: Provider::from_str(&row.get::<_, String>("provider")?).map_err(to_sql_error)?,
        status: RunStatus::from_str(&row.get::<_, String>("status")?).map_err(to_sql_error)?,
        provider_session_id: row.get("provider_session_id")?,
        provider_log_path: row.get("provider_log_path")?,
        config_snapshot: deserialize_json(&row.get::<_, String>("config_snapshot_json")?)
            .map_err(to_sql_error)?,
        started_at: row.get("started_at")?,
        ended_at: row.get("ended_at")?,
    })
}

fn delete_task_records(tx: &Transaction<'_>, task_id: &str) -> Result<()> {
    tx.execute("DELETE FROM feed_entries WHERE task_id = ?1", [task_id])?;
    tx.execute("DELETE FROM active_workspaces WHERE task_id = ?1", [task_id])?;
    tx.execute("DELETE FROM workspace_snapshots WHERE task_id = ?1", [task_id])?;
    tx.execute("DELETE FROM task_events WHERE task_id = ?1", [task_id])?;
    tx.execute("DELETE FROM runs WHERE task_id = ?1", [task_id])?;
    tx.execute("DELETE FROM tasks WHERE id = ?1", [task_id])?;
    Ok(())
}

fn apply_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            brief TEXT NOT NULL DEFAULT '',
            plan_markdown TEXT NOT NULL DEFAULT '',
            lifecycle_state TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS project_resources (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            locator TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT 'null',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            workflow_state TEXT NOT NULL DEFAULT 'todo',
            source_repo_resource_id TEXT,
            worktree_path TEXT NOT NULL,
            worktree_name TEXT NOT NULL DEFAULT '',
            branch_name TEXT NOT NULL DEFAULT '',
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
            task_seq INTEGER,
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

        CREATE TABLE IF NOT EXISTS active_workspaces (
            task_id TEXT PRIMARY KEY,
            selected_view TEXT NOT NULL,
            strip_order INTEGER NOT NULL,
            last_focused_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feed_entries (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            run_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            severity INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            recommended_action TEXT NOT NULL DEFAULT '',
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        "#,
    )?;

    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version >= SCHEMA_VERSION {
        return Ok(());
    }

    if !has_column(conn, "projects", "brief")? {
        conn.execute("ALTER TABLE projects ADD COLUMN brief TEXT NOT NULL DEFAULT ''", [])?;
    }
    if !has_column(conn, "projects", "plan_markdown")? {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN plan_markdown TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    if !has_column(conn, "projects", "lifecycle_state")? {
        conn.execute(
            "ALTER TABLE projects ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'active'",
            [],
        )?;
    }
    conn.execute(
        "UPDATE projects SET brief = COALESCE(NULLIF(brief, ''), description)",
        [],
    )?;

    if !has_column(conn, "tasks", "workflow_state")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN workflow_state TEXT NOT NULL DEFAULT 'todo'",
            [],
        )?;
    }
    if !has_column(conn, "tasks", "source_repo_resource_id")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN source_repo_resource_id TEXT",
            [],
        )?;
    }
    if !has_column(conn, "tasks", "worktree_name")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN worktree_name TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    if !has_column(conn, "tasks", "branch_name")? {
        conn.execute(
            "ALTER TABLE tasks ADD COLUMN branch_name TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    conn.execute(
        r#"
        UPDATE tasks
        SET workflow_state = CASE status
            WHEN 'running' THEN 'in_progress'
            WHEN 'cancelled' THEN 'in_review'
            WHEN 'failed' THEN 'in_review'
            ELSE 'todo'
        END
        WHERE workflow_state IS NULL OR workflow_state = ''
        "#,
        [],
    )?;

    conn.execute(
        "UPDATE tasks SET workflow_state = 'in_review' WHERE workflow_state = 'blocked'",
        [],
    )?;

    if !has_column(conn, "task_events", "task_seq")? {
        conn.execute("ALTER TABLE task_events ADD COLUMN task_seq INTEGER", [])?;
    }

    conn.execute(
        "UPDATE tasks SET last_open_view = 'agent' WHERE last_open_view = 'run'",
        [],
    )?;
    conn.execute(
        "UPDATE active_workspaces SET selected_view = 'agent' WHERE selected_view = 'run'",
        [],
    )?;

    populate_task_sequences(conn)?;

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    Ok(())
}

fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    Ok(rows
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .any(|name| name == column))
}

fn populate_task_sequences(conn: &Connection) -> Result<()> {
    let mut task_stmt = conn.prepare("SELECT DISTINCT task_id FROM task_events ORDER BY task_id")?;
    let task_ids = task_stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    for task_id in task_ids {
        let mut event_stmt = conn.prepare(
            r#"
            SELECT id
            FROM task_events
            WHERE task_id = ?1
            ORDER BY COALESCE(task_seq, 9223372036854775807), created_at ASC, seq ASC, rowid ASC
            "#,
        )?;
        let event_ids = event_stmt
            .query_map([&task_id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (index, event_id) in event_ids.iter().enumerate() {
            conn.execute(
                "UPDATE task_events SET task_seq = ?1 WHERE id = ?2",
                params![index as i64 + 1, event_id],
            )?;
        }
    }

    Ok(())
}

fn serialize_json<T: Serialize>(value: &T) -> Result<String> {
    serde_json::to_string(value).map_err(Into::into)
}

fn deserialize_json<T: DeserializeOwned>(value: &str) -> Result<T> {
    serde_json::from_str(value).map_err(Into::into)
}

fn to_sql_error(error: anyhow::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        0,
        rusqlite::types::Type::Text,
        Box::new(std::io::Error::other(error.to_string())),
    )
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use std::process::Command;
    use std::sync::Mutex;

    use tempfile::tempdir;

    use super::*;
    use crate::domain::{
        CreateProjectResourceInput, ProjectResourceKind, Provider, WorkspaceView,
    };
    use crate::events::SessionUpdate;

    static GIT_TEST_MUTEX: Mutex<()> = Mutex::new(());

    fn init_repo(path: &Path) {
        let _guard = GIT_TEST_MUTEX.lock().unwrap();
        Command::new("git").arg("init").arg(path).output().unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "config", "user.email", "vega@example.com"])
            .output()
            .unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "config", "user.name", "Vega"])
            .output()
            .unwrap();
        std::fs::write(path.join("README.md"), "hello\n").unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "add", "README.md"])
            .output()
            .unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "commit", "-m", "init"])
            .output()
            .unwrap();
    }

    #[test]
    fn store_round_trips_projects_tasks_events_snapshots_and_workspaces() {
        let temp = tempdir().unwrap();
        let store = Store::new(temp.path()).unwrap();

        let repo_path = temp.path().join("repo");
        std::fs::create_dir_all(&repo_path).unwrap();
        init_repo(&repo_path);

        let project = store
            .create_project(CreateProjectInput {
                name: "Alpha".to_string(),
                brief: "Build the monitor".to_string(),
                plan_markdown: "- board\n- workspaces".to_string(),
                resources: vec![CreateProjectResourceInput {
                    kind: ProjectResourceKind::Repo,
                    label: "Main repo".to_string(),
                    locator: repo_path.display().to_string(),
                }],
            })
            .unwrap();

        let repo = store.list_project_repositories(&project.id).unwrap().pop().unwrap();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            project_id: project.id.clone(),
            title: "Set up workspace".to_string(),
            workflow_state: WorkflowState::Todo,
            source_repo_resource_id: Some(repo.id.clone()),
            worktree_path: temp.path().join("worktree").display().to_string(),
            worktree_name: "set-up-workspace".to_string(),
            branch_name: "vega/set-up-workspace".to_string(),
            provider: Provider::Codex,
            model: "gpt-5-codex".to_string(),
            permission_policy: "default".to_string(),
            mcp_subset: Vec::new(),
            skill_subset: Vec::new(),
            current_run_id: None,
            last_open_view: WorkspaceView::Agent,
            created_at: now(),
            updated_at: now(),
        };
        store.insert_task(&task).unwrap();

        let run = store.create_run(&task).unwrap();
        store
            .append_task_event(
                &task.id,
                &run.id,
                &WorkspaceEvent::UserMessage {
                    text: "Build the shell".to_string(),
                },
            )
            .unwrap();
        store
            .append_task_event(
                &task.id,
                &run.id,
                &WorkspaceEvent::SessionUpdate {
                    update: SessionUpdate::TextChunk {
                        text: "Done".to_string(),
                    },
                },
            )
            .unwrap();

        let snapshot = WorkspaceSnapshot {
            messages: Vec::new(),
            current_message: None,
        };
        store.save_snapshot(&task.id, &run.id, &snapshot).unwrap();
        let workspace = store.ensure_active_workspace(&task.id, WorkspaceView::Agent).unwrap();
        assert_eq!(workspace.task_id, task.id);

        let tasks = store.list_tasks(&project.id).unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].workflow_state, WorkflowState::Todo);

        let events = store.list_task_events(&task.id).unwrap();
        assert_eq!(events.len(), 2);

        let loaded_snapshot = store.load_snapshot(&task.id).unwrap();
        assert!(loaded_snapshot.is_some());

        let active = store.list_active_workspaces().unwrap();
        assert_eq!(active.len(), 1);
    }
}
