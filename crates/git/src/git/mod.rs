mod error;
mod models;
mod service;

pub use error::{GitServiceError, Result};
pub use models::{
    CommitDiffRequest, CommitDiffResult, CommitHistoryRequest, CommitHistoryResult,
    CommitReplayFile, CommitReplayHunk, CommitReplayLine, CommitReplayRequest, CommitReplayResult,
    CommitSummary, CreateProjectRequest, CreateWorktreeRequest, DiffRequest, DiffResult, DiffStats,
    DiffTarget, GitRequest, GitResponse, ProjectWorkspace, ReplayFileStatus, ReplayLineKind,
    SemanticHunk, SemanticHunkKind, WorktreeHandle,
};
pub use service::GitService;
