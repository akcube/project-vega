use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Provider {
    Claude,
    Codex,
}

impl Provider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Claude => "Claude",
            Self::Codex => "Codex",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "Claude" => Ok(Self::Claude),
            "Codex" => Ok(Self::Codex),
            other => anyhow::bail!("unknown provider: {other}"),
        }
    }

    pub fn program_name(&self) -> &'static str {
        match self {
            Self::Claude => "claude-agent-acp",
            Self::Codex => "codex-acp",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProjectResourceKind {
    Repo,
    Doc,
}

impl ProjectResourceKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Repo => "repo",
            Self::Doc => "doc",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "repo" => Ok(Self::Repo),
            "doc" => Ok(Self::Doc),
            other => anyhow::bail!("unknown project resource kind: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Idle,
    Running,
    Cancelled,
    Failed,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Running => "running",
            Self::Cancelled => "cancelled",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "idle" => Ok(Self::Idle),
            "running" => Ok(Self::Running),
            "cancelled" => Ok(Self::Cancelled),
            "failed" => Ok(Self::Failed),
            other => anyhow::bail!("unknown task status: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Ready,
    Streaming,
    Cancelled,
    Failed,
}

impl RunStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Streaming => "streaming",
            Self::Cancelled => "cancelled",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "ready" => Ok(Self::Ready),
            "streaming" => Ok(Self::Streaming),
            "cancelled" => Ok(Self::Cancelled),
            "failed" => Ok(Self::Failed),
            other => anyhow::bail!("unknown run status: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskView {
    #[default]
    Agent,
    Review,
    Run,
}

impl TaskView {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Agent => "agent",
            Self::Review => "review",
            Self::Run => "run",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "agent" => Ok(Self::Agent),
            "review" => Ok(Self::Review),
            "run" => Ok(Self::Run),
            other => anyhow::bail!("unknown task view: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResource {
    pub id: String,
    pub project_id: String,
    pub kind: ProjectResourceKind,
    pub label: String,
    pub locator: String,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub status: TaskStatus,
    pub worktree_path: String,
    pub provider: Provider,
    pub model: String,
    pub permission_policy: String,
    pub mcp_subset: Vec<String>,
    pub skill_subset: Vec<String>,
    pub current_run_id: Option<String>,
    pub last_open_view: TaskView,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub task_id: String,
    pub provider: Provider,
    pub status: RunStatus,
    pub provider_session_id: Option<String>,
    pub provider_log_path: Option<String>,
    pub config_snapshot: Value,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddProjectResourceInput {
    pub project_id: String,
    pub kind: ProjectResourceKind,
    pub label: String,
    pub locator: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub project_id: String,
    pub title: String,
    pub worktree_path: String,
    pub provider: Provider,
    pub model: String,
}
