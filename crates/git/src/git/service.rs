use std::fs;
use std::path::Path;

use git2::{
    BranchType, Commit, Delta, DiffFormat, DiffLineType, DiffOptions, Oid, Patch, Repository, Sort,
    Tree, WorktreeAddOptions,
};

use super::error::{GitServiceError, Result};
use super::models::{
    CommitDiffRequest, CommitDiffResult, CommitHistoryRequest, CommitHistoryResult,
    CommitReplayFile, CommitReplayHunk, CommitReplayLine, CommitReplayRequest, CommitReplayResult,
    CommitSummary, CreateProjectRequest, CreateWorktreeRequest, DiffRequest, DiffResult, DiffStats,
    DiffTarget, GitRequest, GitResponse, ProjectWorkspace, ReplayFileStatus, ReplayLineKind,
    WorktreeHandle,
};

#[derive(Debug, Default, Clone, Copy)]
pub struct GitService;

impl GitService {
    pub fn new() -> Self {
        Self
    }

    pub fn execute(&self, request: GitRequest) -> Result<GitResponse> {
        match request {
            GitRequest::CommitHistory(request) => {
                self.commit_history(request).map(GitResponse::CommitHistory)
            }
            GitRequest::CommitDiff(request) => {
                self.commit_diff(request).map(GitResponse::CommitDiff)
            }
            GitRequest::CommitReplay(request) => {
                self.commit_replay(request).map(GitResponse::CommitReplay)
            }
            GitRequest::CreateWorktree(request) => self
                .create_worktree(request)
                .map(GitResponse::WorktreeCreated),
            GitRequest::CreateProject(request) => self
                .create_project(request)
                .map(GitResponse::ProjectCreated),
            GitRequest::Diff(request) => self.diff(request).map(GitResponse::Diff),
        }
    }

    pub fn commit_history(&self, request: CommitHistoryRequest) -> Result<CommitHistoryResult> {
        ensure_repo_exists(&request.repository_path)?;

        let repo = Repository::open(&request.repository_path)?;
        let head_reference = repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_owned));

        let mut revwalk = repo.revwalk()?;
        revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
        revwalk.push_head()?;

        let commits = revwalk
            .take(request.max_count)
            .map(|oid| oid.and_then(|oid| repo.find_commit(oid)))
            .map(|commit| commit.map(|commit| build_commit_summary(&commit)))
            .collect::<std::result::Result<Vec<_>, git2::Error>>()?;

        Ok(CommitHistoryResult {
            repository_path: request.repository_path,
            head_reference,
            commits,
        })
    }

    pub fn commit_diff(&self, request: CommitDiffRequest) -> Result<CommitDiffResult> {
        ensure_repo_exists(&request.repository_path)?;

        let repo = Repository::open(&request.repository_path)?;
        let commit = find_commit(&repo, &request.commit_oid)?;
        let summary = build_commit_summary(&commit);

        let diff = diff_for_commit(&repo, &commit, request.context_lines)?;

        let stats = diff.stats()?;
        let mut patch = String::new();
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            patch.push_str(String::from_utf8_lossy(line.content()).as_ref());
            true
        })?;

        Ok(CommitDiffResult {
            repository_path: request.repository_path,
            commit: summary,
            patch,
            stats: DiffStats {
                files_changed: stats.files_changed(),
                insertions: stats.insertions(),
                deletions: stats.deletions(),
            },
        })
    }

    pub fn commit_replay(&self, request: CommitReplayRequest) -> Result<CommitReplayResult> {
        ensure_repo_exists(&request.repository_path)?;

        let repo = Repository::open(&request.repository_path)?;
        let commit = find_commit(&repo, &request.commit_oid)?;
        let summary = build_commit_summary(&commit);
        let diff = diff_for_commit(&repo, &commit, request.context_lines)?;
        let stats = diff.stats()?;
        let mut files = Vec::new();

        for index in 0..diff.deltas().len() {
            let Some(delta) = diff.get_delta(index) else {
                continue;
            };

            let old_path = diff_path(delta.old_file().path());
            let new_path = diff_path(delta.new_file().path());
            let is_binary = delta.old_file().is_binary() || delta.new_file().is_binary();
            let old_content = if is_binary {
                String::new()
            } else {
                read_blob_text(&repo, delta.old_file().id())?
            };
            let new_content = if is_binary {
                String::new()
            } else {
                read_blob_text(&repo, delta.new_file().id())?
            };
            let mut hunks = Vec::new();

            if let Some(patch) = Patch::from_diff(&diff, index)? {
                for hunk_index in 0..patch.num_hunks() {
                    let (hunk, line_count) = patch.hunk(hunk_index)?;
                    let mut lines = Vec::with_capacity(line_count);

                    for line_index in 0..line_count {
                        let line = patch.line_in_hunk(hunk_index, line_index)?;
                        let kind = match line.origin_value() {
                            DiffLineType::Context => ReplayLineKind::Context,
                            DiffLineType::Addition => ReplayLineKind::Addition,
                            DiffLineType::Deletion => ReplayLineKind::Deletion,
                            DiffLineType::ContextEOFNL => ReplayLineKind::ContextEofNl,
                            DiffLineType::AddEOFNL => ReplayLineKind::AddEofNl,
                            DiffLineType::DeleteEOFNL => ReplayLineKind::DeleteEofNl,
                            DiffLineType::FileHeader
                            | DiffLineType::HunkHeader
                            | DiffLineType::Binary => continue,
                        };

                        lines.push(CommitReplayLine {
                            kind,
                            content: normalize_diff_line(line.content()),
                            old_lineno: line.old_lineno(),
                            new_lineno: line.new_lineno(),
                        });
                    }

                    hunks.push(CommitReplayHunk {
                        old_start: hunk.old_start(),
                        old_lines: hunk.old_lines(),
                        new_start: hunk.new_start(),
                        new_lines: hunk.new_lines(),
                        header: String::from_utf8_lossy(hunk.header()).trim().to_owned(),
                        lines,
                    });
                }
            }

            files.push(CommitReplayFile {
                old_path,
                new_path,
                status: map_replay_status(delta.status()),
                old_content,
                new_content,
                is_binary,
                hunks,
            });
        }

        Ok(CommitReplayResult {
            repository_path: request.repository_path,
            commit: summary,
            stats: DiffStats {
                files_changed: stats.files_changed(),
                insertions: stats.insertions(),
                deletions: stats.deletions(),
            },
            files,
        })
    }

    pub fn create_worktree(&self, request: CreateWorktreeRequest) -> Result<WorktreeHandle> {
        ensure_repo_exists(&request.repository_path)?;

        if request.worktree_path.exists() {
            return Err(GitServiceError::WorktreePathExists {
                path: request.worktree_path.clone(),
            });
        }

        if let Some(parent) = request.worktree_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let repo = Repository::open(&request.repository_path)?;
        if repo.is_bare() {
            return Err(GitServiceError::BareRepository {
                path: request.repository_path.clone(),
            });
        }

        let start_point = request.start_point.as_deref().unwrap_or("HEAD");
        let start_commit = resolve_commit(&repo, start_point)?;
        let branch_created = ensure_branch(
            &repo,
            &request.branch_name,
            &start_commit,
            request.reuse_existing_branch,
        )?;

        let mut options = WorktreeAddOptions::new();
        let branch_ref = format!("refs/heads/{}", request.branch_name);
        let branch_reference = repo.find_reference(&branch_ref)?;
        options.reference(Some(&branch_reference));

        repo.worktree(
            &request.worktree_name,
            &request.worktree_path,
            Some(&mut options),
        )?;

        let worktree_repo = Repository::open(&request.worktree_path)?;
        let head_oid = worktree_repo
            .head()?
            .target()
            .map(|oid| oid.to_string())
            .unwrap_or_default();

        Ok(WorktreeHandle {
            repository_path: request.repository_path,
            worktree_path: request.worktree_path,
            worktree_name: request.worktree_name,
            branch_name: request.branch_name,
            head_oid,
            branch_created,
        })
    }

    pub fn create_project(&self, request: CreateProjectRequest) -> Result<ProjectWorkspace> {
        self.create_worktree(request)
    }

    pub fn diff(&self, request: DiffRequest) -> Result<DiffResult> {
        ensure_repo_exists(&request.repository_path)?;

        let repo = Repository::open(&request.repository_path)?;
        let mut options = DiffOptions::new();
        options.include_untracked(request.include_untracked);
        options.recurse_untracked_dirs(request.include_untracked);
        options.include_typechange(true);
        options.context_lines(request.context_lines);

        let base = resolve_diff_target(&repo, &request.base)?;
        let target = resolve_diff_target(&repo, &request.target)?;

        let diff = match (&base, &target) {
            (ResolvedDiffTarget::Tree(base), ResolvedDiffTarget::Tree(target)) => {
                repo.diff_tree_to_tree(base.as_ref(), target.as_ref(), Some(&mut options))?
            }
            (ResolvedDiffTarget::Tree(base), ResolvedDiffTarget::Index(index)) => {
                repo.diff_tree_to_index(base.as_ref(), Some(index), Some(&mut options))?
            }
            (ResolvedDiffTarget::Tree(base), ResolvedDiffTarget::Workdir) => {
                repo.diff_tree_to_workdir_with_index(base.as_ref(), Some(&mut options))?
            }
            (ResolvedDiffTarget::Index(index), ResolvedDiffTarget::Workdir) => {
                repo.diff_index_to_workdir(Some(index), Some(&mut options))?
            }
            _ => {
                return Err(GitServiceError::UnsupportedDiffTargets {
                    base: describe_target(&request.base),
                    target: describe_target(&request.target),
                });
            }
        };

        let stats = diff.stats()?;
        let mut patch = String::new();
        diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
            patch.push_str(String::from_utf8_lossy(line.content()).as_ref());
            true
        })?;

        Ok(DiffResult {
            repository_path: request.repository_path,
            base: request.base,
            target: request.target,
            patch,
            stats: DiffStats {
                files_changed: stats.files_changed(),
                insertions: stats.insertions(),
                deletions: stats.deletions(),
            },
        })
    }
}

enum ResolvedDiffTarget<'repo> {
    Tree(Option<Tree<'repo>>),
    Index(git2::Index),
    Workdir,
}

fn ensure_repo_exists(path: &Path) -> Result<()> {
    if path.exists() {
        Ok(())
    } else {
        Err(GitServiceError::MissingRepository {
            path: path.to_path_buf(),
        })
    }
}

fn ensure_branch(
    repo: &Repository,
    branch_name: &str,
    start_commit: &Commit<'_>,
    reuse_existing_branch: bool,
) -> Result<bool> {
    match repo.find_branch(branch_name, BranchType::Local) {
        Ok(_) if reuse_existing_branch => Ok(false),
        Ok(_) => Err(GitServiceError::BranchExists {
            branch: branch_name.to_owned(),
        }),
        Err(error) if error.code() == git2::ErrorCode::NotFound => {
            repo.branch(branch_name, start_commit, false)?;
            Ok(true)
        }
        Err(error) => Err(error.into()),
    }
}

fn resolve_commit<'repo>(repo: &'repo Repository, reference: &str) -> Result<Commit<'repo>> {
    let object =
        repo.revparse_single(reference)
            .map_err(|_| GitServiceError::MissingReference {
                reference: reference.to_owned(),
            })?;

    object
        .peel_to_commit()
        .map_err(|_| GitServiceError::MissingReference {
            reference: reference.to_owned(),
        })
}

fn diff_for_commit<'repo>(
    repo: &'repo Repository,
    commit: &Commit<'repo>,
    context_lines: u32,
) -> Result<git2::Diff<'repo>> {
    let mut options = DiffOptions::new();
    options.context_lines(context_lines);
    options.include_typechange(true);
    options.indent_heuristic(true);

    let commit_tree = commit.tree()?;
    let parent_tree = commit
        .parent(0)
        .ok()
        .map(|parent| parent.tree())
        .transpose()?;
    let mut diff =
        repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut options))?;
    diff.find_similar(None)?;
    Ok(diff)
}

fn find_commit<'repo>(repo: &'repo Repository, commit_oid: &str) -> Result<Commit<'repo>> {
    let oid = Oid::from_str(commit_oid).map_err(|_| GitServiceError::MissingReference {
        reference: commit_oid.to_owned(),
    })?;

    repo.find_commit(oid)
        .map_err(|_| GitServiceError::MissingReference {
            reference: commit_oid.to_owned(),
        })
}

fn resolve_diff_target<'repo>(
    repo: &'repo Repository,
    target: &DiffTarget,
) -> Result<ResolvedDiffTarget<'repo>> {
    match target {
        DiffTarget::Head => Ok(ResolvedDiffTarget::Tree(Some(head_tree(repo)?))),
        DiffTarget::Ref(reference) => Ok(ResolvedDiffTarget::Tree(Some(reference_tree(
            repo, reference,
        )?))),
        DiffTarget::Index => Ok(ResolvedDiffTarget::Index(repo.index()?)),
        DiffTarget::Workdir => Ok(ResolvedDiffTarget::Workdir),
    }
}

fn head_tree(repo: &Repository) -> Result<Tree<'_>> {
    repo.head()?.peel_to_tree().map_err(Into::into)
}

fn reference_tree<'repo>(repo: &'repo Repository, reference: &str) -> Result<Tree<'repo>> {
    repo.revparse_single(reference)?
        .peel_to_tree()
        .map_err(Into::into)
}

fn describe_target(target: &DiffTarget) -> String {
    match target {
        DiffTarget::Head => "head".to_owned(),
        DiffTarget::Index => "index".to_owned(),
        DiffTarget::Workdir => "workdir".to_owned(),
        DiffTarget::Ref(reference) => format!("ref:{reference}"),
    }
}

fn map_replay_status(status: Delta) -> ReplayFileStatus {
    match status {
        Delta::Added => ReplayFileStatus::Added,
        Delta::Deleted => ReplayFileStatus::Deleted,
        Delta::Modified => ReplayFileStatus::Modified,
        Delta::Renamed => ReplayFileStatus::Renamed,
        Delta::Copied => ReplayFileStatus::Copied,
        Delta::Typechange => ReplayFileStatus::Typechange,
        Delta::Unmodified
        | Delta::Ignored
        | Delta::Untracked
        | Delta::Unreadable
        | Delta::Conflicted => ReplayFileStatus::Unmodified,
    }
}

fn diff_path(path: Option<&Path>) -> Option<String> {
    path.map(|path| path.to_string_lossy().into_owned())
}

fn read_blob_text(repo: &Repository, oid: Oid) -> Result<String> {
    if oid.is_zero() {
        return Ok(String::new());
    }

    match repo.find_blob(oid) {
        Ok(blob) => Ok(normalize_blob_text(blob.content())),
        Err(_) => Ok(String::new()),
    }
}

fn normalize_blob_text(content: &[u8]) -> String {
    String::from_utf8_lossy(content).replace("\r\n", "\n")
}

fn normalize_diff_line(content: &[u8]) -> String {
    normalize_blob_text(content)
        .trim_end_matches('\n')
        .trim_end_matches('\r')
        .to_owned()
}

fn build_commit_summary(commit: &Commit<'_>) -> CommitSummary {
    let author = commit.author();

    CommitSummary {
        oid: commit.id().to_string(),
        short_oid: commit
            .as_object()
            .short_id()
            .ok()
            .and_then(|buf| buf.as_str().map(str::to_owned))
            .unwrap_or_else(|| commit.id().to_string().chars().take(7).collect()),
        summary: commit.summary().unwrap_or("Untitled commit").to_owned(),
        message: commit.message().unwrap_or_default().trim().to_owned(),
        author_name: author.name().unwrap_or("Unknown author").to_owned(),
        author_email: author.email().unwrap_or_default().to_owned(),
        timestamp: commit.time().seconds(),
        parent_oids: commit.parent_ids().map(|oid| oid.to_string()).collect(),
    }
}
