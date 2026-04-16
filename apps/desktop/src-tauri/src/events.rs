use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionUpdate {
    TextChunk {
        text: String,
    },
    ThinkingChunk {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    ToolCall {
        tool_call_id: String,
        title: String,
        kind: String,
        status: String,
        content: Vec<ToolContent>,
    },
    #[serde(rename_all = "camelCase")]
    ToolCallUpdate {
        tool_call_id: String,
        status: String,
        content: Vec<ToolContent>,
    },
    Plan {
        entries: Vec<PlanEntry>,
    },
    #[serde(rename_all = "camelCase")]
    Done {
        stop_reason: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ToolContent {
    Text {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Diff {
        path: String,
        old_text: Option<String>,
        new_text: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntry {
    pub content: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum WorkspaceEvent {
    UserMessage { text: String },
    SessionUpdate { update: SessionUpdate },
}

impl WorkspaceEvent {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::UserMessage { .. } => "user_message",
            Self::SessionUpdate { update } => match update {
                SessionUpdate::TextChunk { .. } => "text_chunk",
                SessionUpdate::ThinkingChunk { .. } => "thinking_chunk",
                SessionUpdate::ToolCall { .. } => "tool_call",
                SessionUpdate::ToolCallUpdate { .. } => "tool_call_update",
                SessionUpdate::Plan { .. } => "plan",
                SessionUpdate::Done { .. } => "done",
                SessionUpdate::Error { .. } => "error",
            },
        }
    }
}
