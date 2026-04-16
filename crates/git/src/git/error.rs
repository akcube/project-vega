use std::path::PathBuf;

use thiserror::Error;

pub type Result<T> = std::result::Result<T, GitServiceError>;

#[derive(Debug, Error)]
pub enum GitServiceError {
    #[error("git error: {0}")]
    Git(#[from] git2::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("repository path does not exist: {path}")]
    MissingRepository { path: PathBuf },
    #[error("worktree path already exists: {path}")]
    WorktreePathExists { path: PathBuf },
    #[error("a local branch named `{branch}` already exists")]
    BranchExists { branch: String },
    #[error("expected a non-bare repository at {path}")]
    BareRepository { path: PathBuf },
    #[error("repository has no commits yet: {path}")]
    EmptyRepository { path: PathBuf },
    #[error("could not find a commit for `{reference}`")]
    MissingReference { reference: String },
    #[error("unsupported diff targets: `{base}` -> `{target}`")]
    UnsupportedDiffTargets { base: String, target: String },
}
