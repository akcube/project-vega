use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FeedEntryKind {
    Completion,
    Alert,
}

impl FeedEntryKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Completion => "completion",
            Self::Alert => "alert",
        }
    }

    pub fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "completion" => Ok(Self::Completion),
            "alert" => Ok(Self::Alert),
            other => anyhow::bail!("unknown feed entry kind: {other}"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedEntry {
    pub id: String,
    pub task_id: String,
    pub run_id: String,
    pub kind: FeedEntryKind,
    pub severity: i32,
    pub title: String,
    pub summary: String,
    pub category: String,
    pub recommended_action: String,
    pub is_read: bool,
    pub created_at: String,
}
