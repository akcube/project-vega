use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use git2::{Delta, DiffLineType, DiffOptions, Patch, Repository};

use crate::view_model::{
    WorktreeChangeKind, WorktreeChangeViewModel, WorktreeDiffStatsViewModel,
    WorktreeFileDocumentViewModel, WorktreeInspectionViewModel, WorktreeNodeKind, WorktreeTreeNode,
};

const MAX_TREE_NODES: usize = 4_000;
const SKIPPED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
    ".next",
    ".turbo",
];

#[derive(Debug, Default, Clone, Copy)]
pub struct WorktreeInspector;

impl WorktreeInspector {
    pub fn new() -> Self {
        Self
    }

    pub fn inspect(&self, root: &Path) -> Result<WorktreeInspectionViewModel> {
        let repo = Repository::open(root)
            .with_context(|| format!("open worktree repository at {}", root.display()))?;
        let changed_files = collect_changed_files(&repo)?;
        let changed_paths = changed_files
            .iter()
            .map(|entry| entry.path.clone())
            .collect::<HashSet<_>>();
        let mut visited = 0usize;
        let mut truncated = false;
        let tree = build_tree(root, root, &changed_paths, &mut visited, &mut truncated)?;

        Ok(WorktreeInspectionViewModel {
            root_name: root
                .file_name()
                .and_then(|segment| segment.to_str())
                .unwrap_or("worktree")
                .to_string(),
            root_path: root.display().to_string(),
            is_truncated: truncated,
            tree,
            stats: collect_diff_stats(&repo)?,
            changed_files,
        })
    }

    pub fn read_file(&self, root: &Path, relative_path: &str) -> Result<WorktreeFileDocumentViewModel> {
        let absolute = resolve_file_path(root, relative_path)?;
        if !absolute.exists() {
            return Ok(WorktreeFileDocumentViewModel {
                path: relative_path.to_string(),
                text: String::new(),
                is_binary: false,
                is_deleted: true,
                line_count: 0,
            });
        }
        if absolute.is_dir() {
            bail!("cannot open a directory as a file: {relative_path}");
        }

        let bytes = fs::read(&absolute)
            .with_context(|| format!("read worktree file {}", absolute.display()))?;
        match String::from_utf8(bytes) {
            Ok(text) => Ok(WorktreeFileDocumentViewModel {
                path: relative_path.to_string(),
                line_count: text.lines().count(),
                text,
                is_binary: false,
                is_deleted: false,
            }),
            Err(_) => Ok(WorktreeFileDocumentViewModel {
                path: relative_path.to_string(),
                text: String::new(),
                is_binary: true,
                is_deleted: false,
                line_count: 0,
            }),
        }
    }

    pub fn write_file(
        &self,
        root: &Path,
        relative_path: &str,
        contents: &str,
    ) -> Result<WorktreeFileDocumentViewModel> {
        let absolute = resolve_file_path(root, relative_path)?;
        if !absolute.exists() {
            bail!("cannot save a deleted file: {relative_path}");
        }
        if absolute.is_dir() {
            bail!("cannot save a directory: {relative_path}");
        }

        fs::write(&absolute, contents)
            .with_context(|| format!("write worktree file {}", absolute.display()))?;
        self.read_file(root, relative_path)
    }
}

fn collect_diff_stats(repo: &Repository) -> Result<WorktreeDiffStatsViewModel> {
    let diff = worktree_diff(repo)?;
    let stats = diff.stats()?;
    Ok(WorktreeDiffStatsViewModel {
        files_changed: stats.files_changed(),
        insertions: stats.insertions(),
        deletions: stats.deletions(),
    })
}

fn collect_changed_files(repo: &Repository) -> Result<Vec<WorktreeChangeViewModel>> {
    let diff = worktree_diff(repo)?;
    let mut changed_files = Vec::new();

    for index in 0..diff.deltas().len() {
        let Some(delta) = diff.get_delta(index) else {
            continue;
        };
        let path = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .map(normalize_relative_path)
            .unwrap_or_default();
        if path.is_empty() {
            continue;
        }
        let (additions, deletions) = count_patch_lines(&diff, index)?;
        changed_files.push(WorktreeChangeViewModel {
            path,
            kind: map_change_kind(delta.status()),
            additions,
            deletions,
        });
    }

    changed_files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(changed_files)
}

fn worktree_diff(repo: &Repository) -> Result<git2::Diff<'_>> {
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let mut options = DiffOptions::new();
    options.include_untracked(true);
    options.recurse_untracked_dirs(true);
    options.include_typechange(true);
    options.context_lines(0);
    repo.diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut options))
        .map_err(Into::into)
}

fn count_patch_lines(diff: &git2::Diff<'_>, index: usize) -> Result<(usize, usize)> {
    let Some(patch) = Patch::from_diff(diff, index)? else {
        return Ok((0, 0));
    };
    let mut additions = 0usize;
    let mut deletions = 0usize;

    for hunk_index in 0..patch.num_hunks() {
        let (_, line_count) = patch.hunk(hunk_index)?;
        for line_index in 0..line_count {
            let line = patch.line_in_hunk(hunk_index, line_index)?;
            match line.origin_value() {
                DiffLineType::Addition => additions += 1,
                DiffLineType::Deletion => deletions += 1,
                _ => {}
            }
        }
    }

    Ok((additions, deletions))
}

fn build_tree(
    root: &Path,
    current: &Path,
    changed_paths: &HashSet<String>,
    visited: &mut usize,
    truncated: &mut bool,
) -> Result<Vec<WorktreeTreeNode>> {
    if *visited >= MAX_TREE_NODES {
        *truncated = true;
        return Ok(Vec::new());
    }

    let mut entries = fs::read_dir(current)
        .with_context(|| format!("read worktree directory {}", current.display()))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    entries.sort_by(|left, right| {
        let left_type = left.file_type().ok();
        let right_type = right.file_type().ok();
        match (
            left_type.as_ref().map(|kind| kind.is_dir()).unwrap_or(false),
            right_type.as_ref().map(|kind| kind.is_dir()).unwrap_or(false),
        ) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => left.file_name().cmp(&right.file_name()),
        }
    });

    let mut nodes = Vec::new();
    for entry in entries {
        if *visited >= MAX_TREE_NODES {
            *truncated = true;
            break;
        }

        let file_type = entry.file_type()?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        if file_type.is_dir() && SKIPPED_DIRS.contains(&name.as_str()) {
            continue;
        }

        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map(normalize_relative_path)
            .map_err(|error| anyhow!("derive relative worktree path for {}: {error}", path.display()))?;

        *visited += 1;
        if file_type.is_dir() {
            let children = build_tree(root, &path, changed_paths, visited, truncated)?;
            let changed_descendant_count = children
                .iter()
                .map(|child| child.changed_descendant_count)
                .sum();
            nodes.push(WorktreeTreeNode {
                name,
                path: relative,
                kind: WorktreeNodeKind::Directory,
                is_changed: changed_descendant_count > 0,
                changed_descendant_count,
                children,
            });
            continue;
        }

        let is_changed = changed_paths.contains(&relative);
        nodes.push(WorktreeTreeNode {
            name,
            path: relative,
            kind: WorktreeNodeKind::File,
            is_changed,
            changed_descendant_count: usize::from(is_changed),
            children: Vec::new(),
        });
    }

    Ok(nodes)
}

fn resolve_file_path(root: &Path, relative_path: &str) -> Result<PathBuf> {
    if relative_path.trim().is_empty() {
        bail!("file path is required");
    }
    let relative = Path::new(relative_path);
    if relative.is_absolute() {
        bail!("file path must be relative to the worktree");
    }
    if relative.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_) | Component::CurDir
        )
    }) {
        bail!("file path must stay within the worktree");
    }

    let root = root
        .canonicalize()
        .with_context(|| format!("resolve worktree root {}", root.display()))?;
    let absolute = root.join(relative);
    if absolute.exists() {
        let canonical = absolute
            .canonicalize()
            .with_context(|| format!("resolve worktree file {}", absolute.display()))?;
        if !canonical.starts_with(&root) {
            bail!("file path escaped the worktree");
        }
    }
    Ok(absolute)
}

fn normalize_relative_path(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(segment) => Some(segment.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn map_change_kind(delta: Delta) -> WorktreeChangeKind {
    match delta {
        Delta::Added | Delta::Untracked => WorktreeChangeKind::Added,
        Delta::Deleted => WorktreeChangeKind::Deleted,
        Delta::Renamed => WorktreeChangeKind::Renamed,
        Delta::Copied => WorktreeChangeKind::Copied,
        Delta::Typechange => WorktreeChangeKind::Typechange,
        _ => WorktreeChangeKind::Modified,
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::Command;

    use tempfile::tempdir;

    use super::*;

    fn run_git(path: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(["-C", path.to_str().unwrap()])
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn init_repo(path: &Path) {
        Command::new("git").arg("init").arg(path).output().unwrap();
        run_git(path, &["config", "user.email", "vega@example.com"]);
        run_git(path, &["config", "user.name", "Vega"]);
        std::fs::create_dir_all(path.join("src")).unwrap();
        std::fs::write(path.join("src/lib.rs"), "pub fn greet() {}\n").unwrap();
        std::fs::write(path.join("README.md"), "hello\n").unwrap();
        run_git(path, &["add", "."]);
        run_git(path, &["commit", "-m", "init"]);
    }

    fn find_node<'a>(nodes: &'a [WorktreeTreeNode], target_path: &str) -> Option<&'a WorktreeTreeNode> {
        for node in nodes {
            if node.path == target_path {
                return Some(node);
            }
            if let Some(found) = find_node(&node.children, target_path) {
                return Some(found);
            }
        }
        None
    }

    #[test]
    fn inspector_builds_tree_change_summary_and_reads_files() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);

        std::fs::write(repo.join("src/lib.rs"), "pub fn greet() {\n    println!(\"hi\");\n}\n").unwrap();
        std::fs::create_dir_all(repo.join("notes")).unwrap();
        std::fs::write(repo.join("notes/todo.md"), "- ship files view\n").unwrap();
        std::fs::remove_file(repo.join("README.md")).unwrap();

        let inspector = WorktreeInspector::new();
        let overview = inspector.inspect(&repo).unwrap();

        assert_eq!(overview.root_name, "repo");
        assert_eq!(overview.changed_files.len(), 3);
        assert!(
            overview
                .changed_files
                .iter()
                .any(|file| file.path == "README.md" && file.kind == WorktreeChangeKind::Deleted)
        );
        assert!(
            overview
                .changed_files
                .iter()
                .any(|file| file.path == "notes/todo.md" && file.kind == WorktreeChangeKind::Added)
        );
        assert_eq!(
            find_node(&overview.tree, "src").unwrap().changed_descendant_count,
            1
        );
        assert!(find_node(&overview.tree, "notes/todo.md").unwrap().is_changed);
        assert!(find_node(&overview.tree, "README.md").is_none());

        let document = inspector.read_file(&repo, "src/lib.rs").unwrap();
        assert!(!document.is_binary);
        assert!(!document.is_deleted);
        assert!(document.text.contains("println!"));

        let deleted = inspector.read_file(&repo, "README.md").unwrap();
        assert!(deleted.is_deleted);
        assert_eq!(deleted.text, "");
    }

    #[test]
    fn inspector_writes_text_files_back_to_disk() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);

        let inspector = WorktreeInspector::new();
        let saved = inspector
            .write_file(&repo, "src/lib.rs", "pub fn greet() {\n    println!(\"edited\");\n}\n")
            .unwrap();

        assert_eq!(saved.path, "src/lib.rs");
        assert!(saved.text.contains("edited"));
        assert_eq!(
            std::fs::read_to_string(repo.join("src/lib.rs")).unwrap(),
            saved.text
        );
    }
}
