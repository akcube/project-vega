use tauri::async_runtime::spawn_blocking;
use vega_git::{
    CommitDiffRequest, CommitDiffResult, CommitHistoryRequest, CommitHistoryResult,
    CommitReplayRequest, CommitReplayResult, CreateWorktreeRequest, GitService, WorktreeHandle,
};

use crate::semantic_diff::annotate_commit_replay;

#[tauri::command]
pub async fn load_commit_history(
    request: CommitHistoryRequest,
) -> Result<CommitHistoryResult, String> {
    run_git_job(move |git| git.commit_history(request)).await
}

#[tauri::command]
pub async fn load_commit_diff(request: CommitDiffRequest) -> Result<CommitDiffResult, String> {
    run_git_job(move |git| git.commit_diff(request)).await
}

#[tauri::command]
pub async fn load_commit_replay(
    request: CommitReplayRequest,
) -> Result<CommitReplayResult, String> {
    let replay = run_git_job(move |git| git.commit_replay(request)).await?;
    Ok(annotate_commit_replay(replay).await)
}

#[tauri::command]
pub async fn create_worktree(request: CreateWorktreeRequest) -> Result<WorktreeHandle, String> {
    run_git_job(move |git| git.create_worktree(request)).await
}

async fn run_git_job<T, F>(job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(GitService) -> vega_git::Result<T> + Send + 'static,
{
    spawn_blocking(move || job(GitService::new()).map_err(|error| error.to_string()))
        .await
        .map_err(|error| error.to_string())?
}
