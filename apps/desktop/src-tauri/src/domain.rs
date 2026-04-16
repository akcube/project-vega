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
pub enum ProjectLifecycleState {
    Active,
    Archived,
}

impl ProjectLifecycleState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Archived => "archived",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "active" => Ok(Self::Active),
            "archived" => Ok(Self::Archived),
            other => anyhow::bail!("unknown project lifecycle state: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowState {
    Todo,
    InProgress,
    InReview,
    Completed,
}

impl WorkflowState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::InReview => "in_review",
            Self::Completed => "completed",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "todo" => Ok(Self::Todo),
            "in_progress" => Ok(Self::InProgress),
            "in_review" => Ok(Self::InReview),
            "completed" => Ok(Self::Completed),
            other => anyhow::bail!("unknown workflow state: {other}"),
        }
    }

    pub fn ordered() -> [Self; 4] {
        [
            Self::Todo,
            Self::InProgress,
            Self::InReview,
            Self::Completed,
        ]
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::Todo => "Todo",
            Self::InProgress => "In Progress",
            Self::InReview => "In Review",
            Self::Completed => "Completed",
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
pub enum WorkspaceView {
    #[default]
    Agent,
    Files,
    Terminal,
    Review,
}

impl WorkspaceView {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Agent => "agent",
            Self::Files => "files",
            Self::Terminal => "terminal",
            Self::Review => "review",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "agent" => Ok(Self::Agent),
            "files" => Ok(Self::Files),
            "terminal" => Ok(Self::Terminal),
            "review" => Ok(Self::Review),
            "run" => Ok(Self::Agent),
            other => anyhow::bail!("unknown workspace view: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub brief: String,
    pub plan_markdown: String,
    pub lifecycle_state: ProjectLifecycleState,
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
    pub workflow_state: WorkflowState,
    pub source_repo_resource_id: Option<String>,
    pub worktree_path: String,
    pub worktree_name: String,
    pub branch_name: String,
    pub provider: Provider,
    pub model: String,
    pub permission_policy: String,
    pub mcp_subset: Vec<String>,
    pub skill_subset: Vec<String>,
    pub current_run_id: Option<String>,
    pub last_open_view: WorkspaceView,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWorkspace {
    pub task_id: String,
    pub selected_view: WorkspaceView,
    pub strip_order: i64,
    pub last_focused_at: String,
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
pub struct CreateProjectResourceInput {
    pub kind: ProjectResourceKind,
    pub label: String,
    pub locator: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub brief: String,
    pub plan_markdown: String,
    pub resources: Vec<CreateProjectResourceInput>,
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
    pub source_repo_resource_id: Option<String>,
    #[serde(default = "default_materialize_worktree")]
    pub materialize_worktree: bool,
    pub provider: Provider,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPlanningInput {
    pub name: String,
    pub brief: String,
    pub plan_markdown: String,
    pub resources: Vec<CreateProjectResourceInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlanningReadiness {
    Early,
    NeedsClarification,
    Solid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlanningIssueSeverity {
    Critical,
    Warning,
    Note,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPlanningIssue {
    pub severity: PlanningIssueSeverity,
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPlanGuidance {
    pub summary: Option<String>,
    pub readiness: PlanningReadiness,
    pub suggestions: Vec<String>,
    pub issues: Vec<ProjectPlanningIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedProjectTask {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub rationale: Option<String>,
    pub source_repo_label: Option<String>,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTaskSuggestions {
    pub summary: Option<String>,
    pub tasks: Vec<SuggestedProjectTask>,
}

fn default_materialize_worktree() -> bool {
    true
}
