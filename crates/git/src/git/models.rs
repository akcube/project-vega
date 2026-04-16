use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorktreeRequest {
    pub repository_path: PathBuf,
    pub worktree_path: PathBuf,
    pub worktree_name: String,
    pub branch_name: String,
    pub start_point: Option<String>,
    #[serde(default)]
    pub reuse_existing_branch: bool,
}

pub type CreateProjectRequest = CreateWorktreeRequest;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeHandle {
    pub repository_path: PathBuf,
    pub worktree_path: PathBuf,
    pub worktree_name: String,
    pub branch_name: String,
    pub head_oid: String,
    pub branch_created: bool,
}

pub type ProjectWorkspace = WorktreeHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffRequest {
    pub repository_path: PathBuf,
    pub base: DiffTarget,
    pub target: DiffTarget,
    #[serde(default = "default_true")]
    pub include_untracked: bool,
    #[serde(default = "default_context_lines")]
    pub context_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum DiffTarget {
    Head,
    Index,
    Workdir,
    Ref(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub repository_path: PathBuf,
    pub base: DiffTarget,
    pub target: DiffTarget,
    pub patch: String,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitHistoryRequest {
    pub repository_path: PathBuf,
    #[serde(default = "default_history_limit")]
    pub max_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitHistoryResult {
    pub repository_path: PathBuf,
    pub head_reference: Option<String>,
    pub commits: Vec<CommitSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub parent_oids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiffRequest {
    pub repository_path: PathBuf,
    pub commit_oid: String,
    #[serde(default = "default_context_lines")]
    pub context_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiffResult {
    pub repository_path: PathBuf,
    pub commit: CommitSummary,
    pub patch: String,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitReplayRequest {
    pub repository_path: PathBuf,
    pub commit_oid: String,
    #[serde(default = "default_context_lines")]
    pub context_lines: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitReplayResult {
    pub repository_path: PathBuf,
    pub commit: CommitSummary,
    pub stats: DiffStats,
    pub files: Vec<CommitReplayFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitReplayFile {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: ReplayFileStatus,
    pub old_content: String,
    pub new_content: String,
    pub is_binary: bool,
    pub hunks: Vec<CommitReplayHunk>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitReplayHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub header: String,
    pub lines: Vec<CommitReplayLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitReplayLine {
    pub kind: ReplayLineKind,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplayFileStatus {
    Added,
    Deleted,
    Modified,
    Renamed,
    Copied,
    Typechange,
    Unmodified,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplayLineKind {
    Context,
    Addition,
    Deletion,
    ContextEofNl,
    AddEofNl,
    DeleteEofNl,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum GitRequest {
    CommitHistory(CommitHistoryRequest),
    CommitDiff(CommitDiffRequest),
    CommitReplay(CommitReplayRequest),
    CreateWorktree(CreateWorktreeRequest),
    CreateProject(CreateProjectRequest),
    Diff(DiffRequest),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum GitResponse {
    CommitHistory(CommitHistoryResult),
    CommitDiff(CommitDiffResult),
    CommitReplay(CommitReplayResult),
    WorktreeCreated(WorktreeHandle),
    ProjectCreated(ProjectWorkspace),
    Diff(DiffResult),
}

fn default_true() -> bool {
    true
}

fn default_context_lines() -> u32 {
    3
}

fn default_history_limit() -> usize {
    80
}
