use serde::{Deserialize, Serialize};

use crate::domain::{ActiveWorkspace, Project, ProjectResource, Run, Task, WorkflowState};
use crate::events::ToolContent;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCallState {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub content: Vec<ToolContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MessageSegment {
    Text {
        text: String,
    },
    Thinking {
        text: String,
    },
    ToolCall {
        #[serde(rename = "toolCall", alias = "tool_call")]
        tool_call: ToolCallState,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub segments: Vec<MessageSegment>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub messages: Vec<ChatMessage>,
    pub current_message: Option<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiffArtifact {
    pub path: String,
    pub old_text: Option<String>,
    pub new_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSummary {
    pub tool_calls: Vec<ToolCallState>,
    pub diffs: Vec<DiffArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TerminalEvent {
    Output { data: String },
    Exit { exit_code: i32 },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveStateViewModel {
    pub has_session: bool,
    pub can_resume: bool,
    pub is_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunViewModel {
    pub run: Run,
    pub session_reference: Option<String>,
    pub log_reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorktreeNodeKind {
    Directory,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WorktreeChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Typechange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeTreeNode {
    pub name: String,
    pub path: String,
    pub kind: WorktreeNodeKind,
    pub is_changed: bool,
    pub changed_descendant_count: usize,
    pub children: Vec<WorktreeTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeChangeViewModel {
    pub path: String,
    pub kind: WorktreeChangeKind,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeDiffStatsViewModel {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInspectionViewModel {
    pub root_name: String,
    pub root_path: String,
    pub is_truncated: bool,
    pub tree: Vec<WorktreeTreeNode>,
    pub changed_files: Vec<WorktreeChangeViewModel>,
    pub stats: WorktreeDiffStatsViewModel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeFileDocumentViewModel {
    pub path: String,
    pub text: String,
    pub is_binary: bool,
    pub is_deleted: bool,
    pub line_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummaryViewModel {
    pub workspace: ActiveWorkspace,
    pub task_id: String,
    pub task_title: String,
    pub project_id: String,
    pub project_name: String,
    pub workflow_state: WorkflowState,
    pub is_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskBoardCardViewModel {
    pub task: Task,
    pub source_repo: Option<ProjectResource>,
    pub has_open_workspace: bool,
    pub is_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskBoardColumnViewModel {
    pub state: WorkflowState,
    pub label: String,
    pub tasks: Vec<TaskBoardCardViewModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBoardViewModel {
    pub project: Project,
    pub repositories: Vec<ProjectResource>,
    pub documents: Vec<ProjectResource>,
    pub columns: Vec<TaskBoardColumnViewModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWorkspaceViewModel {
    pub workspace: ActiveWorkspace,
    pub project: Project,
    pub task: Task,
    pub source_repo: Option<ProjectResource>,
    pub documents: Vec<ProjectResource>,
    pub run: Option<RunViewModel>,
    pub snapshot: WorkspaceSnapshot,
    pub review: ReviewSummary,
    pub live: LiveStateViewModel,
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::events::ToolContent;

    #[test]
    fn message_segment_serializes_tool_call_payload_in_camel_case() {
        let segment = MessageSegment::ToolCall {
            tool_call: ToolCallState {
                id: "call-1".to_string(),
                title: "Edit app shell".to_string(),
                kind: "edit".to_string(),
                status: "completed".to_string(),
                content: vec![ToolContent::Diff {
                    path: "src/App.tsx".to_string(),
                    old_text: Some("old".to_string()),
                    new_text: "new".to_string(),
                }],
            },
        };

        let value = serde_json::to_value(segment).unwrap();
        assert_eq!(
            value,
            json!({
                "type": "toolCall",
                "toolCall": {
                    "id": "call-1",
                    "title": "Edit app shell",
                    "kind": "edit",
                    "status": "completed",
                    "content": [
                        {
                            "type": "diff",
                            "path": "src/App.tsx",
                            "oldText": "old",
                            "newText": "new"
                        }
                    ]
                }
            })
        );
    }

    #[test]
    fn message_segment_deserializes_legacy_snake_case_tool_call_payload() {
        let value = json!({
            "type": "toolCall",
            "tool_call": {
                "id": "call-1",
                "title": "Edit app shell",
                "kind": "edit",
                "status": "completed",
                "content": []
            }
        });

        let segment: MessageSegment = serde_json::from_value(value).unwrap();
        match segment {
            MessageSegment::ToolCall { tool_call } => {
                assert_eq!(tool_call.id, "call-1");
                assert_eq!(tool_call.kind, "edit");
            }
            _ => panic!("expected tool call segment"),
        }
    }
}
